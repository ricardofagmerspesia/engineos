// `engineos router-golden` — the CLI arm scripts/router-golden.sh shims over
// (routing-decision-layer design §6, contracts §5).
//
//   collect [<repo>...]                         shadow router spans -> candidates.local.jsonl
//   run [--mode m]... [--cases f] [--write-default]   grade modes -> RESULTS.md (+ policy default)
//
// `run --write-default` is the ONLY writer of registries/policy.json
// router_decision.default; without the flag the run only reports.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import type { AsyncCommand } from '../dispatch';
import type { Io } from '../io';
import { lazyRegistries } from '../kernel/context';
import { resolveRoot } from '../registry/paths';
import {
  isGoldenSetProvenance,
  isRouterMode,
  loadRouterDecisionPolicy,
  type RouterDecisionPolicy,
  type RouterMode,
} from '../registry/policy-router-decision';
import { parseCases } from './router-golden-cases';
import { CANDIDATES_FILE, collect, renderSummary } from './router-golden-collect';
import { writeRouterDefault } from './router-golden-policy';
import {
  acceptance,
  advisorCaseRouter,
  renderResults,
  scoreMode,
  scoresForPolicy,
  type CaseRouterFactory,
  type ModeScore,
} from './router-golden-run';

export const CASES_FILE = join('evals', 'router-golden', 'cases.jsonl');
export const RESULTS_FILE = join('evals', 'router-golden', 'RESULTS.md');

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

const USAGE = 'usage: router-golden collect [<repo>...] | router-golden run [--mode keyword|llm|jev]... [--cases <file>] [--write-default]\n';

export interface RouterGoldenDeps {
  now: () => number;
  spawn: typeof spawnSync;
  caseRouter: CaseRouterFactory;
  fetch?: typeof fetch;
  clock?: () => number;
}

export function routerGoldenCommand(deps: RouterGoldenDeps): AsyncCommand {
  return (argv: string[], io: Io) => {
    const [sub, ...rest] = argv;
    if (sub === 'collect') return runCollect(rest, io, deps);
    if (sub === 'run') return runGolden(rest, io, deps);
    io.err(USAGE);
    return EXIT_USAGE;
  };
}

export const runRouterGolden: AsyncCommand = routerGoldenCommand({
  now: Date.now,
  spawn: spawnSync,
  caseRouter: advisorCaseRouter,
});

// ---------------------------------------------------------------- collect

function runCollect(argv: string[], io: Io, deps: RouterGoldenDeps): number {
  const root = resolveRoot(io.env);
  const repos = argv.length === 0 ? [io.cwd()] : argv.map((repo) => resolvePath(io.cwd(), repo));
  const summaries = collect(root, repos, { home: io.env['HOME'] ?? '', now: deps.now, spawn: deps.spawn });
  for (const summary of summaries) io.out(`router-golden collect: ${renderSummary(summary)}\n`);
  const appended = summaries.reduce((sum, summary) => sum + summary.appended, 0);
  io.out(`router-golden collect: ${appended} candidate(s) appended to ${CANDIDATES_FILE} (gitignored; may hold client data — label, redact and set source before copying a case into ${CASES_FILE})\n`);
  return EXIT_OK;
}

// ---------------------------------------------------------------- run

interface RunArgs {
  modes: RouterMode[];
  cases: string | null;
  writeDefault: boolean;
}

function parseRunArgs(argv: readonly string[]): RunArgs | string {
  const args: RunArgs = { modes: [], cases: null, writeDefault: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--write-default') {
      args.writeDefault = true;
    } else if (arg === '--mode') {
      const mode = argv[i + 1];
      if (!isRouterMode(mode)) return `--mode takes keyword|llm|jev, got ${mode ?? 'nothing'}`;
      if (!args.modes.includes(mode)) args.modes.push(mode);
      i += 1;
    } else if (arg === '--cases') {
      const file = argv[i + 1];
      if (file === undefined || file === '') return '--cases takes a file';
      args.cases = file;
      i += 1;
    } else {
      return `unknown argument ${arg ?? ''}`;
    }
  }
  return args;
}

async function runGolden(argv: string[], io: Io, deps: RouterGoldenDeps): Promise<number> {
  const args = parseRunArgs(argv);
  if (typeof args === 'string') {
    io.err(`router-golden run: ${args}\n${USAGE}`);
    return EXIT_USAGE;
  }
  const root = resolveRoot(io.env);
  const casesPath = args.cases === null ? join(root, CASES_FILE) : resolvePath(io.cwd(), args.cases);
  const shownPath = relative(root, casesPath).startsWith('..') ? casesPath : relative(root, casesPath);
  let text: string;
  try {
    text = readFileSync(casesPath, 'utf8');
  } catch {
    text = '';
  }
  const parsed = parseCases(text);
  if (parsed.malformed.length > 0) {
    for (const problem of parsed.malformed) io.err(`router-golden run: malformed case, ${problem}\n`);
    return EXIT_FAILURE;
  }
  if (parsed.cases.length === 0) {
    io.out(`router-golden run: no cases in ${shownPath} — collect and curate first (evals/router-golden/README.md)\n`);
    return EXIT_OK;
  }

  const policy = loadRouterDecisionPolicy(root);
  const modes = args.modes.length > 0 ? args.modes : policy.modes;
  const registries = lazyRegistries(root);
  const router = deps.caseRouter(root, caseRouterDeps(io, deps));
  const scores = new Map<RouterMode, ModeScore>();
  try {
    for (const mode of modes) scores.set(mode, await scoreMode(parsed.cases, mode, router.route, registries));
  } finally {
    router.dispose();
  }

  const verdict = acceptance(scores, policy.modes);
  const date = new Date(deps.now()).toISOString().slice(0, 10);
  const defaultLine = args.writeDefault
    ? applyDefault(root, { verdict, scores, date, golden: goldenSetId(shownPath, text, parsed.cases.length), policy })
    : `unchanged (${policy.default ?? 'null'}); run with --write-default to apply the acceptance rule`;

  const results = renderResults({ date, head: gitHead(root, deps.spawn), casesPath: shownPath, cases: parsed.cases, scores, verdict, defaultLine });
  const resultsPath = join(root, RESULTS_FILE);
  mkdirSync(dirname(resultsPath), { recursive: true });
  writeFileSync(resultsPath, results);

  for (const [mode, score] of scores) {
    io.out(`router-golden run: ${mode} intent_accuracy ${score.intent_accuracy} stack_correctness ${score.stack_correctness} p95_ms ${score.p95_ms} fallback_rate ${score.fallback_rate}\n`);
  }
  io.out(`router-golden run: ${verdict.kind === 'winner' ? `${verdict.mode} wins` : `no winner — ${verdict.reason}`}\n`);
  io.out(`router-golden run: default ${defaultLine}\n`);
  io.out(`router-golden run: ${parsed.cases.length} case(s), results in ${RESULTS_FILE}\n`);
  return defaultLine.startsWith('NOT written') ? EXIT_FAILURE : EXIT_OK;
}

function caseRouterDeps(io: Io, deps: RouterGoldenDeps): Parameters<CaseRouterFactory>[1] {
  const out: Parameters<CaseRouterFactory>[1] = {
    env: io.env,
    now: deps.clock ?? (() => performance.now()),
  };
  if (deps.fetch !== undefined) out.fetch = deps.fetch;
  return out;
}

interface DefaultFacts {
  verdict: ReturnType<typeof acceptance>;
  scores: ReadonlyMap<RouterMode, ModeScore>;
  date: string;
  golden: string;
  policy: RouterDecisionPolicy;
}

// A winner writes the default with its provenance. No winner retires an
// earlier golden-set winner to null (a later tie is a real result), but never
// a developer's recorded decision: the set has not shown anything better.
function applyDefault(root: string, facts: DefaultFacts): string {
  const standing = facts.policy.default_written_by;
  if (facts.verdict.kind !== 'winner' && standing !== null && !isGoldenSetProvenance(standing)) {
    return `unchanged (${String(facts.policy.default)}): no winner, the developer decision of ${standing.date} stands`;
  }
  const value = facts.verdict.kind === 'winner'
    ? { mode: facts.verdict.mode, writtenBy: { date: facts.date, golden_set: facts.golden, scores: scoresForPolicy(facts.scores) } }
    : { mode: null, writtenBy: null };
  const outcome = writeRouterDefault(root, value);
  if (!outcome.ok) return `NOT written: ${outcome.reason}`;
  const what = value.mode === null ? 'null (auto)' : value.mode;
  return outcome.changed ? `written: ${what}` : `already ${what}`;
}

function goldenSetId(path: string, text: string, count: number): string {
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
  return `${path} sha256:${hash} cases:${count}`;
}

// Read-only.
function gitHead(root: string, spawn: typeof spawnSync): string {
  const result = spawn('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  const out = typeof result.stdout === 'string' ? result.stdout.trim() : '';
  return result.status === 0 && out !== '' ? out : 'unknown';
}
