// `router-golden collect` (routing-decision-layer contracts §5): turns the
// shadow-mode router spans of one or more repositories into CANDIDATE golden
// cases — real prompts with what each mode decided, `expect_intents: null`
// until the developer labels them.
//
// Output goes to evals/router-golden/candidates.local.jsonl, which is
// gitignored on purpose: a transcript prompt may carry client data. The
// developer curates (labels, redacts, sets `source`) into the committed
// cases.jsonl. Nothing here prints prompt text — only counts.
import type { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve as resolvePath } from 'node:path';
import { repositoryStack } from '../kernel/resolve';
import { isRecord } from '../lib/json';
import { gitDir, repoRoot } from '../lib/git';
import { isRouterMode, type RouterMode } from '../registry/policy-router-decision';
import { joinSpan, readTurns, transcriptFiles, type Turn } from './router-golden-transcript';

export const CANDIDATES_FILE = join('evals', 'router-golden', 'candidates.local.jsonl');

export interface CollectDeps {
  home: string;
  now: () => number;
  spawn: typeof spawnSync;
}

export interface RepoSummary {
  repo: string;
  journal: boolean;
  spans: number;
  noDecision: number;
  joined: number;
  noTranscript: number;
  noTurn: number;
  nonHuman: number;
  duplicates: number;
  appended: number;
  disagreements: number;
}

// The parsed `note` of a router span (src/hooks/prompt-advisor-router.ts
// routerNote is the source of truth for the format):
// `req=<setting> conf=<c|-> esc=<0|1> fb=<reason|-> kw=<csv|-> dis=<0|1|->`.
export interface RouterNote {
  requested: string;
  confidence: number | null;
  escalate: boolean;
  fallback: string | null;
  keyword: string[];
  disagreement: boolean | null;
}

export interface CandidateShadow {
  mode: RouterMode;
  intents: string[];
  keyword_intents: string[];
  disagreement: boolean | null;
  confidence: number | null;
}

export function parseRouterNote(note: unknown): RouterNote | null {
  if (typeof note !== 'string') return null;
  const fields = new Map<string, string>();
  for (const token of note.split(' ')) {
    const eq = token.indexOf('=');
    if (eq > 0) fields.set(token.slice(0, eq), token.slice(eq + 1));
  }
  const requested = fields.get('req');
  const conf = fields.get('conf');
  const esc = fields.get('esc');
  const fb = fields.get('fb');
  const kw = fields.get('kw');
  const dis = fields.get('dis');
  if (requested === undefined || conf === undefined || esc === undefined || fb === undefined || kw === undefined || dis === undefined) {
    return null;
  }
  const confidence = conf === '-' ? null : Number.parseFloat(conf);
  if (confidence !== null && !Number.isFinite(confidence)) return null;
  return {
    requested,
    confidence,
    escalate: esc === '1',
    fallback: fb === '-' ? null : fb,
    keyword: kw === '-' ? [] : kw.split(',').filter((id) => id !== ''),
    disagreement: dis === '-' ? null : dis === '1',
  };
}

// The span records the keyword answer in full but the decided intents only as
// `route` — the first of the contract's intents. So the decided set is the
// keyword set unless the modes disagreed, and then only its primary is known.
export function shadowOf(mode: RouterMode, route: unknown, note: RouterNote): CandidateShadow {
  const primary = typeof route === 'string' && route !== 'none' ? [route] : [];
  return {
    mode,
    intents: note.disagreement === true ? primary : note.keyword,
    keyword_intents: note.keyword,
    disagreement: note.disagreement,
    confidence: note.confidence,
  };
}

export function collect(root: string, repos: readonly string[], deps: CollectDeps): RepoSummary[] {
  const out = join(root, CANDIDATES_FILE);
  const seen = existingKeys(out);
  const turnsBySession = new Map<string, Turn[] | null>();
  const lines: string[] = [];
  const summaries = repos.map((repo) => collectRepo(repo, { deps, seen, turnsBySession, lines }));
  if (lines.length > 0) {
    mkdirSync(dirname(out), { recursive: true });
    appendFileSync(out, lines.join(''));
  }
  return summaries;
}

interface CollectState {
  deps: CollectDeps;
  seen: Set<string>;
  turnsBySession: Map<string, Turn[] | null>;
  lines: string[];
}

function collectRepo(repo: string, state: CollectState): RepoSummary {
  const { deps } = state;
  const top = repoRoot(repo, deps.spawn) ?? resolvePath(repo);
  const summary: RepoSummary = {
    repo: basename(top), journal: false, spans: 0, noDecision: 0, joined: 0, noTranscript: 0, noTurn: 0,
    nonHuman: 0, duplicates: 0, appended: 0, disagreements: 0,
  };
  const journalDir = join(gitDir(repo, deps.spawn) ?? join(top, '.git'), 'engineos-telemetry');
  if (!existsSync(journalDir)) return summary;
  summary.journal = true;
  const stack = stackEntries(top);
  const collectedAt = new Date(deps.now()).toISOString().slice(0, 10);
  for (const span of routerSpans(journalDir)) {
    summary.spans += 1;
    const mode = span['provider'];
    const note = parseRouterNote(span['note']);
    const traceId = span['trace_id'];
    const at = typeof span['timestamp'] === 'string' ? Date.parse(span['timestamp']) : Number.NaN;
    // A span without a decision is a non-substantive prompt or one written
    // before the decision layer existed: nothing to compare, nothing to label.
    if (!isRouterMode(mode) || note === null || typeof traceId !== 'string' || !Number.isFinite(at)) {
      summary.noDecision += 1;
      continue;
    }
    const joined = joinSpan(turnsFor(traceId, state), at);
    if (joined.kind === 'no-transcript') summary.noTranscript += 1;
    if (joined.kind === 'no-turn') summary.noTurn += 1;
    if (joined.kind === 'non-human') summary.nonHuman += 1;
    if (joined.kind !== 'joined') continue;
    summary.joined += 1;
    if (note.disagreement === true) summary.disagreements += 1;
    const key = candidateKey(summary.repo, joined.text);
    if (state.seen.has(key)) {
      summary.duplicates += 1;
      continue;
    }
    state.seen.add(key);
    const shadow = shadowOf(mode, span['route'], note);
    state.lines.push(`${JSON.stringify(candidateLine({ key, repo: summary.repo, stack, prompt: joined.text, collectedAt, shadow, escalate: note.escalate }))}\n`);
    summary.appended += 1;
  }
  return summary;
}

function turnsFor(sessionId: string, state: CollectState): Turn[] | null {
  const cached = state.turnsBySession.get(sessionId);
  if (cached !== undefined) return cached;
  const files = transcriptFiles(state.deps.home, sessionId);
  const turns = files.length === 0 ? null : readTurns(files);
  state.turnsBySession.set(sessionId, turns);
  return turns;
}

function routerSpans(dir: string): Record<string, unknown>[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((name) => name.endsWith('.exec.jsonl')).sort();
  } catch {
    return [];
  }
  const spans: Record<string, unknown>[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(join(dir, file), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      const parsed = parseLine(line);
      if (parsed !== null && parsed['span_kind'] === 'router') spans.push(parsed);
    }
  }
  return spans;
}

function parseLine(line: string): Record<string, unknown> | null {
  if (line === '') return null;
  try {
    const parsed: unknown = JSON.parse(line);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// `<language>` or `<language>:<framework>` per package, each pair once — the
// golden case's `stack` form (contracts §2 amendment), which the run's
// throwaway projects rebuild one directory per entry.
function stackEntries(top: string): string[] {
  const stack = repositoryStack(top, top);
  const entries = (stack?.packages ?? []).map((pkg) => (pkg.framework === null ? pkg.language : `${pkg.language}:${pkg.framework}`));
  return [...new Set(entries)];
}

interface CandidateFacts {
  key: string;
  repo: string;
  stack: string[];
  prompt: string;
  collectedAt: string;
  shadow: CandidateShadow;
  escalate: boolean;
}

// Contracts §5 field order, plus the shadow block the developer labels from.
// `expect_escalate` is null like `expect_intents`: the span's esc flag is what
// the mode did, not what it should have done.
function candidateLine(facts: CandidateFacts): Record<string, unknown> {
  const frameworks = [...new Set(facts.stack.flatMap((entry) => {
    const framework = entry.split(':')[1];
    return framework === undefined ? [] : [framework];
  }))];
  return {
    id: `cand-${facts.key.slice(0, 12)}`,
    source: 'real',
    repo: facts.repo,
    stack: facts.stack,
    frameworks,
    prompt: facts.prompt,
    expect_intents: null,
    expect_escalate: null,
    collected_at: facts.collectedAt,
    note: '',
    shadow: { ...facts.shadow, escalate: facts.escalate },
  };
}

function candidateKey(repo: string, prompt: string): string {
  return createHash('sha256').update(`${repo}\0${prompt}`).digest('hex');
}

// De-duplication survives across runs: a candidate already in the file, by
// prompt and repo, is never appended twice.
function existingKeys(path: string): Set<string> {
  const keys = new Set<string>();
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return keys;
  }
  for (const line of text.split('\n')) {
    const parsed = parseLine(line);
    if (parsed !== null && typeof parsed['repo'] === 'string' && typeof parsed['prompt'] === 'string') {
      keys.add(candidateKey(parsed['repo'], parsed['prompt']));
    }
  }
  return keys;
}

export function renderSummary(summary: RepoSummary): string {
  if (!summary.journal) return `${summary.repo}: no telemetry journal (.git/engineos-telemetry)`;
  const unjoined = summary.noTranscript + summary.noTurn;
  return `${summary.repo}: spans read ${summary.spans}, no decision ${summary.noDecision}, joined ${summary.joined}, ` +
    `unjoined ${unjoined} (no transcript ${summary.noTranscript}, no turn ${summary.noTurn}), non-human ${summary.nonHuman}, ` +
    `duplicates ${summary.duplicates}, appended ${summary.appended}, disagreements ${summary.disagreements}`;
}
