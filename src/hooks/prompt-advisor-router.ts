// The routing decision layer's half of the UserPromptSubmit adapter
// (docs/specs/2026-10-06-routing-decision-layer-contracts.md §3 and its async
// amendment). resolve-task stays synchronous and deterministic; this module
// runs after it: it reads the caller's project once, asks the decision layer
// which mode decides, folds the answer into the contract the guidance renders,
// and states what the router span records. It never throws and never blocks a
// prompt — any failure renders the kernel's contract with a visible
// `router: llm (... unavailable: error)` line.
import type { spawnSync } from 'node:child_process';
import type { TaskContractSection } from '../kernel';
import type { Registries } from '../kernel/context';
import {
  buildDecisionInput,
  decide,
  effectiveSetting,
  resolveAuto,
  type Decision,
  type DecisionDeps,
  type DecisionInput,
} from '../kernel/decision-layer';
import { repositoryStack } from '../kernel/resolve';
import { routeByIntent, type StackFacts } from '../kernel/route';
import { enabledSkills, suppressedSkills } from '../kernel/skill-state';
import {
  isRouterSetting,
  loadRouterDecisionPolicy,
  type RouterDecisionPolicy,
  type RouterMode,
  type RouterSetting,
} from '../registry/policy-router-decision';
import {
  advisorCacheDir,
  decisionCachePath,
  readCachedDecision,
  readCachedPackages,
  stackCachePath,
  writeCachedDecision,
  writeCachedPackages,
} from './cache';
import type { HookEnvelope } from './envelope';
import type { HookContext } from './output';
import type { RouterView, TaskAnswer } from './prompt-advisor-guidance';
import type { SpanFields } from './telemetry';
import { projectConfig } from './verify-targets';

// What a test injects in place of the network and the clocks.
export type RouterDeps = Pick<DecisionDeps, 'fetch' | 'now' | 'schedule'>;

// The caller's repository as the advisor sees it: where it is, where its git
// dir is (for the session cache), and its resolved stack.
export interface AdvisorProject {
  root: string | null;
  cwd: string;
  cacheDir: string | null;
  stack: StackFacts | undefined;
}

export interface RoutedTask {
  task: TaskAnswer;
  fields: SpanFields;
}

// The router span's model for each mode: Jev's own model id, the floor, or the
// in-session router agent that decides on the residue.
const KEYWORD_MODEL = 'keyword';
const ROUTER_AGENT_MODEL = 'router-agent';

// The journal caps every value at 256 characters (policy.json
// telemetry.exec_journal.max_value_length) and REJECTS a longer one, which
// would lose the whole span, so the note is truncated here.
const NOTE_MAX = 256;

// Settings the advisor reports that `decide` does not: the repo cap lowered the
// developer's setting to keyword, or this path threw.
const REPO_CAP = 'repo-cap';
const ERROR = 'error';

// One git call for both facts, the way route-before-change reads them. An empty
// cwd is never handed to git: `git -C ''` answers for the hook's own process
// directory, which is the EngineOS checkout, not the caller's project.
export function advisorProject(env: HookEnvelope, ctx: HookContext): AdvisorProject {
  const none: AdvisorProject = { root: null, cwd: env.cwd, cacheDir: null, stack: undefined };
  if (env.cwd === '') return none;
  const git = gitFacts(env.cwd, ctx.spawn);
  if (git === null) return none;
  const cacheDir = advisorCacheDir(git.gitDir, env.sessionId, ctx.io.env['ENGINEOS_ROUTE_CACHE_BUSTER'] ?? '');
  return { root: git.root, cwd: env.cwd, cacheDir, stack: cachedStack(git.root, env.cwd, cacheDir) };
}

function gitFacts(cwd: string, spawn: typeof spawnSync): { root: string; gitDir: string } | null {
  const result = spawn('git', ['-C', cwd, 'rev-parse', '--show-toplevel', '--absolute-git-dir'], { encoding: 'utf8' });
  if (result.error !== undefined || result.status !== 0 || typeof result.stdout !== 'string') return null;
  const [root, gitDir] = result.stdout.trim().split('\n');
  if (root === undefined || root === '' || gitDir === undefined) return null;
  return { root, gitDir };
}

// The package list is cached per project root for the session; the focus
// depends on the working directory and is recomputed every time.
function cachedStack(root: string, cwd: string, cacheDir: string | null): StackFacts | undefined {
  const path = cacheDir === null ? null : stackCachePath(cacheDir, root);
  const known = path === null ? null : readCachedPackages(path);
  const stack = repositoryStack(root, cwd, known ?? undefined);
  if (path !== null && known === null && stack !== undefined) writeCachedPackages(path, stack.packages);
  return stack;
}

export interface RouteParams {
  prompt: string;
  task: TaskAnswer;
  project: AdvisorProject;
  ctx: HookContext;
  regs: Registries;
  deps: RouterDeps;
}

// The decision path. Skipped for a contract with nothing substantive to route
// (a pure question renders nothing either way). Never throws.
export async function routeDecision(params: RouteParams): Promise<RoutedTask> {
  const { task } = params;
  if (!task.contract.substantive) return { task, fields: {} };
  const env = params.ctx.io.env;
  const personal = env['ENGINEOS_ROUTER'];
  // Read before the policy loads, so a thrown policy still reports the setting
  // the developer actually chose (an explicit keyword stays keyword).
  let requested: RouterSetting = isRouterSetting(personal) ? personal : 'auto';
  try {
    const policy = loadRouterDecisionPolicy(params.ctx.root);
    const asked: RouterSetting = isRouterSetting(personal) ? personal : policy.default ?? 'auto';
    requested = asked;
    const repoMode = params.project.root === null ? null : projectConfig(params.project.root)?.router?.mode ?? null;
    const setting = effectiveSetting(personal, repoMode, policy.default, policy.restrictiveness);
    requested = setting;
    const mode = resolveAuto(setting, env, policy.jev.key_env);
    const input = decisionInput(params);
    const { decision, cacheHit } = await cachedDecision(params, input, { mode, setting, policy });
    const capped = decision.fallback_reason === null && decision.mode === 'keyword' && looser(asked, setting, policy);
    const fallback = decision.fallback_reason !== null
      ? { requested: decision.requested, reason: decision.fallback_reason }
      : capped ? { requested: asked, reason: REPO_CAP } : null;
    const view: RouterView = {
      mode: decision.mode,
      confidence: decision.confidence,
      fallback,
      escalation: decision.escalate && decision.escalate_reason !== null
        ? { reason: decision.escalate_reason, candidates: input.candidates.map((candidate) => candidate.id) }
        : null,
    };
    const contract = decision.mode === 'jev' ? contractFor(decision.intents, task.contract, params.regs) : task.contract;
    return {
      task: { ...task, contract, router: view },
      fields: spanFields(decision, policy, cacheHit, fallback?.reason ?? null),
    };
  } catch {
    // The floor is what the kernel already rendered, so a thrown decision path
    // degrades to the llm mode over it (the agent on the residue), and to
    // keyword only when keyword was the setting.
    const fallback = { requested, reason: ERROR };
    const mode: RouterMode = requested === 'keyword' ? 'keyword' : 'llm';
    const view: RouterView = { mode, confidence: null, fallback, escalation: mode === 'llm' ? floorEscalation(task) : null };
    return { task: { ...task, router: view }, fields: errorFields(mode, requested, task) };
  }
}

// The llm mode's own escalation rule, read off the kernel's route when the
// decision layer itself could not run.
function floorEscalation(task: TaskAnswer): RouterView['escalation'] {
  const { route } = task;
  if (route.generic_only) return { reason: 'generic-only', candidates: [...route.intents] };
  if (route.intents.length === 0) return { reason: 'no-match', candidates: [] };
  return null;
}

// The floor's surviving matches as IntentMatch rows: routeByIntent over the
// SAME stack resolve used, filtered to the ids the escalate form kept.
function decisionInput(params: RouteParams): DecisionInput {
  const survivors = params.task.route.intents;
  const candidates = routeByIntent(params.prompt, params.regs, params.project.stack).matches.filter((match) =>
    survivors.includes(match.id),
  );
  return buildDecisionInput({
    prompt: params.prompt,
    candidates,
    genericOnly: params.task.route.generic_only,
    stack: params.project.stack,
    intents: params.regs.intents.intents,
  });
}

interface DecideFacts {
  mode: RouterMode;
  setting: RouterSetting;
  policy: RouterDecisionPolicy;
}

// The floor costs nothing to recompute, so only a mode that may call out or
// hand off is cached: a resubmitted prompt never pays for a second Jev call.
async function cachedDecision(
  params: RouteParams,
  input: DecisionInput,
  facts: DecideFacts,
): Promise<{ decision: Decision; cacheHit: boolean }> {
  const { cacheDir } = params.project;
  const path = cacheDir === null || facts.mode === 'keyword'
    ? null
    : decisionCachePath(cacheDir, {
      prompt: params.prompt,
      languages: input.languages,
      frameworks: input.frameworks,
      focus: params.project.stack?.focus?.dir ?? null,
      requested: facts.setting,
      mode: facts.mode,
    });
  const cached = path === null ? null : readCachedDecision(path);
  if (cached !== null) return { decision: cached, cacheHit: true };
  const decision = await decide(input, facts.mode, facts.setting, facts.policy, {
    ...params.deps,
    env: params.ctx.io.env,
  });
  if (path !== null) writeCachedDecision(path, decision);
  return { decision, cacheHit: false };
}

// Whether the developer asked for something the repo cap then lowered.
function looser(asked: RouterSetting, effective: RouterSetting, policy: RouterDecisionPolicy): boolean {
  return rank(asked, policy) > rank(effective, policy);
}

function rank(setting: RouterSetting, policy: RouterDecisionPolicy): number {
  const index = policy.restrictiveness.indexOf(setting);
  return index === -1 ? policy.restrictiveness.length : index;
}

// The contract for intents the decision layer chose instead of the floor: the
// intents and everything derived from each row (rules, skills, agents,
// commands, mcp) follow the choice; policy rules, risk floor, ceiling, scale
// and the decision-rule answers stay the kernel's — the model chooses an
// intent, never a gate.
export function contractFor(intents: readonly string[], contract: TaskContractSection, regs: Registries): TaskContractSection {
  if (sameMembers(intents, contract.intents)) return contract;
  const rows = regs.intents.intents.filter((intent) => intents.includes(intent.id));
  const declaredSkills = unique(rows.flatMap((intent) => intent.skills));
  return {
    ...contract,
    intents: rows.map((intent) => intent.id),
    agents: unique(rows.flatMap((intent) => intent.agents)),
    rules: unique(rows.flatMap((intent) => intent.rules)),
    skills: enabledSkills(declaredSkills, regs.skillState),
    skills_suppressed: suppressedSkills(declaredSkills, regs.skillState),
    commands: unique(rows.flatMap((intent) => intent.commands)),
    mcp: unique(rows.flatMap((intent) => intent.mcp)),
  };
}

// Existing journal fields only (contracts §3): no schema change.
function spanFields(decision: Decision, policy: RouterDecisionPolicy, cacheHit: boolean, fallback: string | null): SpanFields {
  const fields: SpanFields = {
    provider: decision.mode,
    model: decision.mode === 'jev' ? policy.jev.model : decision.mode === 'keyword' ? KEYWORD_MODEL : ROUTER_AGENT_MODEL,
    cache_hit: cacheHit,
    note: routerNote({
      requested: decision.requested,
      confidence: decision.confidence,
      escalate: decision.escalate,
      fallback,
      keyword: decision.shadow?.keyword_intents ?? decision.intents,
      disagreement: decision.shadow === null ? null : decision.shadow.disagreement,
    }),
  };
  if (decision.cost_micros !== null) fields.cost_micros = decision.cost_micros;
  return fields;
}

function errorFields(mode: RouterMode, requested: RouterSetting, task: TaskAnswer): SpanFields {
  return {
    provider: mode,
    model: mode === 'keyword' ? KEYWORD_MODEL : ROUTER_AGENT_MODEL,
    cache_hit: false,
    note: routerNote({ requested, confidence: null, escalate: false, fallback: ERROR, keyword: task.route.intents, disagreement: null }),
  };
}

interface NoteFacts {
  requested: RouterSetting;
  confidence: number | null;
  escalate: boolean;
  fallback: string | null;
  keyword: readonly string[];
  disagreement: boolean | null;
}

// `req=<requested> conf=<c|-> esc=<0|1> fb=<reason|-> kw=<csv> dis=<0|1|->`,
// ids and numbers only. The keyword csv is the one unbounded part, so it is
// the part cut to keep the whole note inside the journal's value cap.
export function routerNote(facts: NoteFacts): string {
  const head = `req=${facts.requested} conf=${facts.confidence === null ? '-' : facts.confidence.toFixed(2)} esc=${facts.escalate ? 1 : 0} fb=${facts.fallback ?? '-'} kw=`;
  const tail = ` dis=${facts.disagreement === null ? '-' : facts.disagreement ? 1 : 0}`;
  const csv = facts.keyword.length === 0 ? '-' : facts.keyword.join(',');
  const room = NOTE_MAX - head.length - tail.length;
  return `${head}${csv.length <= room ? csv : csv.slice(0, Math.max(0, room))}${tail}`;
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
