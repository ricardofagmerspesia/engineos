import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { isRecord } from '../lib/json';
import type { IntentRow } from '../registry/intents';
import {
  isRouterSetting,
  type RouterDecisionPolicy,
  type RouterMode,
  type RouterSetting,
} from '../registry/policy-router-decision';
import type { Language } from '../registry/project-config';
import { stackEligible, type IntentMatch, type StackFacts } from './route';

// The routing decision layer (docs/specs/2026-10-06-routing-decision-layer-
// contracts.md §2 and its async amendment). The keyword floor in route.ts is
// synchronous and deterministic; this layer sits over it and may ask a model
// which of the offered intents a prompt is about. It is async because the Jev
// call is a `fetch`, so resolve() never calls it — the prompt advisor does,
// after resolve-task, under a hard deadline. Every I/O (fetch, env, clock,
// timer, CLI probe) is injected with a real default so the tests drive each
// failure without a network.

export interface DecisionInput {
  prompt: string;
  languages: Language[];
  frameworks: string[];
  filesNamed: string[];
  // The floor's result after rebind and suppression.
  candidates: IntentMatch[];
  // What the layer MAY choose: never a row whose stack the repository lacks.
  offered: IntentRow[];
  genericOnly: boolean;
}

export type FallbackReason = 'no-key' | 'timeout' | `http-${number}` | 'bad-answer' | 'network' | 'no-cli';

// Why the layer handed the request to the router agent. Carried on the
// Decision because two of the five (a tie, the model saying it needs a
// planner) leave no other trace on it: the probabilities and the needs_router
// answer are consumed inside the Jev verdict.
export type EscalateReason = 'generic-only' | 'low-confidence' | 'tie' | 'needs-router' | 'no-match';

export interface DecisionShadow {
  keyword_intents: string[];
  disagreement: boolean;
}

export interface Decision {
  // The mode that actually decided; `keyword` after any fallback.
  mode: RouterMode;
  // The setting after the restrictiveness merge, before `auto` was resolved.
  requested: RouterSetting;
  intents: string[];
  confidence: number | null;
  escalate: boolean;
  fallback_reason: FallbackReason | null;
  // Non-null iff the policy has no measured default yet (shadow mode).
  shadow: DecisionShadow | null;
  latency_ms: number;
  cost_micros: number | null;
  // Non-null iff `escalate`.
  escalate_reason: EscalateReason | null;
}

// Arms a deadline and returns its cancel. Injected so a test can fire the
// deadline immediately instead of waiting on the wall clock.
export type Schedule = (callback: () => void, ms: number) => () => void;

export interface DecisionDeps {
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  hasClaudeCli?: () => boolean;
  schedule?: Schedule;
}

// The sentinel option Jev may pick when no offered intent applies. Double
// underscores keep it outside the intent id vocabulary.
const NONE_CHOICE = '__none__';

// The needs_router answer is a probability; at or above one half the model
// itself says the request spans domains, which is the router agent's job.
const NEEDS_ROUTER_THRESHOLD = 0.5;

const FILES_NAMED_CAP = 10;

const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'pyi', 'json', 'jsonl', 'md', 'yml', 'yaml',
  'toml', 'sql', 'sh', 'css', 'scss', 'html', 'go', 'rs', 'java', 'kt', 'swift', 'rb', 'php',
  'vue', 'svelte', 'tf', 'cfg', 'ini', 'env', 'lock', 'txt',
]);

// Fixed question texts: they are part of what the golden set measures, so a
// change here is a prompt change and owes a golden-set run.
const INTENT_INSTRUCTIONS =
  'Pick the one intent this developer request to a coding assistant is primarily about, ' +
  'given the repository languages and frameworks in the state. Choose __none__ when no listed intent applies.';
const NEEDS_ROUTER_INSTRUCTIONS =
  'Does this developer request span several engineering domains, or stay ambiguous between ' +
  'the offered intents, so that a planner should decide how to split it?';

// --- the setting ------------------------------------------------------------

// The personal setting (ENGINEOS_ROUTER) and the repo's cap
// (.engineos/config.json router.mode) merge to the MORE restrictive of the two,
// so a client repo that says `keyword` never sends a prompt off the machine,
// whatever a developer set personally. An unreadable personal value is treated
// as unset rather than refused: routing is advisory and must not block a turn.
export function effectiveSetting(
  personal: string | undefined,
  repo: RouterSetting | null | undefined,
  policyDefault: RouterMode | null,
  restrictiveness: readonly string[],
): RouterSetting {
  const asked: RouterSetting = isRouterSetting(personal) ? personal : policyDefault ?? 'auto';
  if (repo === null || repo === undefined) return asked;
  return rank(repo, restrictiveness) < rank(asked, restrictiveness) ? repo : asked;
}

// A setting absent from the order ranks least restrictive, so a repo cap that
// IS listed always wins over it.
function rank(setting: RouterSetting, restrictiveness: readonly string[]): number {
  const index = restrictiveness.indexOf(setting);
  return index === -1 ? restrictiveness.length : index;
}

// `auto` means the best mode this machine can run: Jev when its key is set,
// the in-session router agent when the claude CLI is present, else the floor.
export function resolveAuto(
  setting: RouterSetting,
  env: Readonly<Record<string, string | undefined>>,
  keyEnv: string,
  hasClaudeCli: () => boolean,
): RouterMode {
  if (setting !== 'auto') return setting;
  if (nonEmpty(env[keyEnv])) return 'jev';
  return safeProbe(hasClaudeCli) ? 'llm' : 'keyword';
}

// The real CLI probe: an executable `claude` file on PATH. No process is
// spawned — a probe that runs the CLI would cost seconds inside a hook.
export function claudeCliOnPath(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const names = process.platform === 'win32' ? ['claude.exe', 'claude.cmd', 'claude'] : ['claude'];
  const dirs = (env['PATH'] ?? '').split(delimiter).filter((dir) => dir !== '');
  return dirs.some((dir) => names.some((name) => isExecutableFile(join(dir, name))));
}

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// --- the input --------------------------------------------------------------

export interface DecisionInputParams {
  prompt: string;
  candidates: IntentMatch[];
  genericOnly: boolean;
  stack: StackFacts | undefined;
  intents: readonly IntentRow[];
}

export function buildDecisionInput(params: DecisionInputParams): DecisionInput {
  const packages = params.stack?.packages ?? [];
  const languages = unique(packages.map((pkg) => pkg.language));
  const frameworks = unique(packages.flatMap((pkg) => (pkg.framework === null ? [] : [pkg.framework])));
  // Exactly the floor's eligibility: a row the two-level rebind would swap for
  // its sibling (a NestJS row in a FastAPI-plus-React repository) is never
  // offered. No manifest means no stack is known, so the floor rules nothing
  // out and neither does this.
  const offered = params.intents.filter((intent) => stackEligible(intent, params.intents, params.stack));
  return {
    prompt: params.prompt,
    languages,
    frameworks,
    filesNamed: filesNamedIn(params.prompt),
    candidates: params.candidates,
    offered,
    genericOnly: params.genericOnly,
  };
}

// File names only, never contents: what the design's privacy table allows to
// leave the machine. A token counts when it is path-shaped (a slash) or ends in
// a known source extension; URLs are not files and are left out.
function filesNamedIn(prompt: string): string[] {
  const found: string[] = [];
  for (const raw of prompt.split(/\s+/)) {
    const token = raw.replace(/^[`'"(<[{]+/, '').replace(/[`'")>\]},;:!?.]+$/, '');
    if (token === '' || token.includes('://') || !/^[A-Za-z0-9_.@~/-]+$/.test(token)) continue;
    if (!token.includes('/') && !hasSourceExtension(token)) continue;
    if (!found.includes(token)) found.push(token);
    if (found.length === FILES_NAMED_CAP) break;
  }
  return found;
}

function hasSourceExtension(token: string): boolean {
  const dot = token.lastIndexOf('.');
  if (dot <= 0 || dot === token.length - 1) return false;
  return SOURCE_EXTENSIONS.has(token.slice(dot + 1).toLowerCase());
}

// --- the decision -----------------------------------------------------------

interface Verdict {
  mode: RouterMode;
  intents: string[];
  confidence: number | null;
  escalate: boolean;
  escalate_reason: EscalateReason | null;
  fallback_reason: FallbackReason | null;
  cost_micros: number | null;
}

// Never throws: every failure is a keyword decision with a named reason, so the
// advisor can always render a contract and say visibly what degraded.
export async function decide(
  input: DecisionInput,
  mode: RouterMode,
  requested: RouterSetting,
  policy: RouterDecisionPolicy,
  deps: DecisionDeps = {},
): Promise<Decision> {
  const now = deps.now ?? (() => performance.now());
  const started = now();
  const keywordIntents = input.candidates.map((candidate) => candidate.id);
  const verdict = await verdictFor(input, mode, policy, deps, keywordIntents);
  return {
    mode: verdict.mode,
    requested,
    intents: verdict.intents,
    confidence: verdict.confidence,
    escalate: verdict.escalate,
    fallback_reason: verdict.fallback_reason,
    shadow: policy.default === null
      ? { keyword_intents: keywordIntents, disagreement: verdict.mode !== 'keyword' && !sameSet(verdict.intents, keywordIntents) }
      : null,
    latency_ms: Math.max(0, Math.round(now() - started)),
    cost_micros: verdict.cost_micros,
    escalate_reason: verdict.escalate ? verdict.escalate_reason : null,
  };
}

async function verdictFor(
  input: DecisionInput,
  mode: RouterMode,
  policy: RouterDecisionPolicy,
  deps: DecisionDeps,
  keywordIntents: string[],
): Promise<Verdict> {
  const env = deps.env ?? process.env;
  if (mode === 'keyword') return keywordVerdict(keywordIntents, null);
  if (mode === 'llm') {
    const hasClaudeCli = deps.hasClaudeCli ?? (() => claudeCliOnPath(env));
    if (!safeProbe(hasClaudeCli)) return keywordVerdict(keywordIntents, 'no-cli');
    // The hook calls no model: the in-session router agent decides, and only
    // on the residue the floor could not settle.
    return {
      mode: 'llm',
      intents: keywordIntents,
      confidence: null,
      escalate: input.genericOnly || input.candidates.length === 0,
      escalate_reason: input.genericOnly ? 'generic-only' : input.candidates.length === 0 ? 'no-match' : null,
      fallback_reason: null,
      cost_micros: null,
    };
  }
  const key = env[policy.jev.key_env];
  if (!nonEmpty(key)) return keywordVerdict(keywordIntents, 'no-key');
  return jevVerdict(input, policy, deps, key, keywordIntents);
}

// The keyword verdict escalates nothing itself: the floor's own escalation
// (policy.router) is the advisor's, already computed by resolve-task.
function keywordVerdict(keywordIntents: string[], reason: FallbackReason | null): Verdict {
  return { mode: 'keyword', intents: keywordIntents, confidence: null, escalate: false, escalate_reason: null, fallback_reason: reason, cost_micros: null };
}

// --- jev --------------------------------------------------------------------

interface JevAnswer {
  choice: string;
  confidence: number;
  probabilities: number[];
  needsRouter: number;
  costMicros: number | null;
}

type JevCall = { ok: true; body: unknown } | { ok: false; reason: FallbackReason };

async function jevVerdict(
  input: DecisionInput,
  policy: RouterDecisionPolicy,
  deps: DecisionDeps,
  key: string,
  keywordIntents: string[],
): Promise<Verdict> {
  const call = await callJev(jevRequestBody(input, policy), policy, deps, key);
  if (!call.ok) return keywordVerdict(keywordIntents, call.reason);
  const answer = parseJevAnswer(call.body, input.offered);
  if (answer === null) return keywordVerdict(keywordIntents, 'bad-answer');

  const ranked = [...answer.probabilities].sort((a, b) => b - a);
  const gap = (ranked[0] ?? 0) - (ranked[1] ?? 0);
  // First reason wins, in the order a reader would check them: the model was
  // unsure of its pick, then two picks were close, then it said a planner is
  // needed even though one pick stood out.
  const doubt: EscalateReason | null =
    answer.confidence < policy.min_confidence ? 'low-confidence'
      : gap < policy.tie_margin ? 'tie'
        : answer.needsRouter >= NEEDS_ROUTER_THRESHOLD ? 'needs-router'
          : null;

  if (answer.choice === NONE_CHOICE) {
    return { mode: 'jev', intents: keywordIntents, confidence: answer.confidence, escalate: true, escalate_reason: 'no-match', fallback_reason: null, cost_micros: answer.costMicros };
  }
  // The floor's other matches survive beside the choice only when they were
  // specific: a generic-only floor is exactly what the model was asked to
  // replace, so its guesses are dropped.
  const extras = input.genericOnly ? [] : keywordIntents.filter((id) => id !== answer.choice);
  return {
    mode: 'jev',
    intents: [answer.choice, ...extras],
    confidence: answer.confidence,
    escalate: doubt !== null,
    escalate_reason: doubt,
    fallback_reason: null,
    cost_micros: answer.costMicros,
  };
}

function jevRequestBody(input: DecisionInput, policy: RouterDecisionPolicy): Record<string, unknown> {
  const available: Record<string, unknown> = {
    prompt: input.prompt,
    languages: input.languages,
    frameworks: input.frameworks,
    files_named: input.filesNamed,
  };
  // Only the policy's state fields leave the machine; a field the policy names
  // but this layer cannot fill is omitted rather than sent empty.
  const state: Record<string, unknown> = {};
  for (const field of policy.state_fields) {
    if (field in available) state[field] = available[field];
  }
  const criteria: Record<string, string> = {};
  for (const intent of input.offered) {
    criteria[intent.id] = intent.note === null ? intent.title : `${intent.title}. ${intent.note}`;
  }
  criteria[NONE_CHOICE] = 'none of these intents applies';
  return {
    model: policy.jev.model,
    state,
    questions: {
      intent: { type: 'choice', instructions: INTENT_INSTRUCTIONS, criteria },
      needs_router: { type: 'noul', instructions: NEEDS_ROUTER_INSTRUCTIONS },
    },
  };
}

// One call, no retries: a 429 or 529 inside a hook is a fallback, never a
// backoff. The deadline covers the response body too, and races the fetch so a
// transport that ignores the abort signal still cannot hold the turn.
async function callJev(body: Record<string, unknown>, policy: RouterDecisionPolicy, deps: DecisionDeps, key: string): Promise<JevCall> {
  const fetchImpl = deps.fetch ?? fetch;
  const schedule = deps.schedule ?? defaultSchedule;
  const controller = new AbortController();
  let cancel: () => void = () => undefined;
  const deadline = new Promise<'deadline'>((resolve) => {
    cancel = schedule(() => {
      controller.abort();
      resolve('deadline');
    }, policy.jev.budget_ms);
  });
  try {
    const response = await Promise.race([
      fetchImpl(policy.jev.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      }),
      deadline,
    ]);
    if (response === 'deadline') return { ok: false, reason: 'timeout' };
    if (!response.ok) return { ok: false, reason: `http-${response.status}` };
    const text = await Promise.race([response.text(), deadline]);
    if (text === 'deadline') return { ok: false, reason: 'timeout' };
    return parseJson(text);
  } catch (error) {
    return { ok: false, reason: controller.signal.aborted || isAbortError(error) ? 'timeout' : 'network' };
  } finally {
    cancel();
  }
}

const defaultSchedule: Schedule = (callback, ms) => {
  const handle = setTimeout(callback, ms);
  return () => clearTimeout(handle);
};

function parseJson(text: string): JevCall {
  try {
    const body: unknown = JSON.parse(text);
    return { ok: true, body };
  } catch {
    return { ok: false, reason: 'bad-answer' };
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

// Model output is untrusted input (rules/llm-apps.md): every field is narrowed
// and range-checked, and the choice must be one this layer offered.
function parseJevAnswer(body: unknown, offered: readonly IntentRow[]): JevAnswer | null {
  if (!isRecord(body) || !isRecord(body['answers'])) return null;
  const answers = body['answers'];
  const intent = answers['intent'];
  if (!isRecord(intent)) return null;

  const choice = intent['choice'];
  const allowed = choice === NONE_CHOICE || offered.some((row) => row.id === choice);
  if (typeof choice !== 'string' || !allowed) return null;
  const confidence = unitNumber(intent['confidence']);
  if (confidence === null) return null;
  const rawProbabilities = intent['probabilities'];
  if (!isRecord(rawProbabilities)) return null;
  const probabilities: number[] = [];
  for (const value of Object.values(rawProbabilities)) {
    const probability = unitNumber(value);
    if (probability === null) return null;
    probabilities.push(probability);
  }

  let needsRouter = 0;
  const rawNeedsRouter = answers['needs_router'];
  if (rawNeedsRouter !== undefined) {
    if (!isRecord(rawNeedsRouter)) return null;
    const noul = unitNumber(rawNeedsRouter['noul']);
    if (noul === null) return null;
    needsRouter = noul;
  }
  return { choice, confidence, probabilities, needsRouter, costMicros: costMicrosOf(body['usage']) };
}

// `usage.cost` is read as US dollars and stored as integer micro-USD, the unit
// the exec journal's cost_micros field carries. Cost is bookkeeping, not a gate
// input, so an unreadable figure is unknown (null), never a bad answer.
function costMicrosOf(usage: unknown): number | null {
  if (!isRecord(usage)) return null;
  const cost = usage['cost'];
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) return null;
  return Math.round(cost * 1_000_000);
}

function unitNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
}

// --- helpers ----------------------------------------------------------------

function safeProbe(probe: () => boolean): boolean {
  try {
    return probe();
  } catch {
    return false;
  }
}

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}
