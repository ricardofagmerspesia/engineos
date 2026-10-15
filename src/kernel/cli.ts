import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { writeJson, type Io } from '../io';
import { repoRoot } from '../lib/git';
import { isRecord, KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { loadProjectConfig } from '../registry/project-config';
import type { AdmitFacts } from './admit';
import type { BreakerFacts } from './breaker';
import { isRiskTier, lazyRegistries, type KernelContext, type RiskTier } from './context';
import type { HitlFacts } from './hitl';
import { parseExecutionFacts } from './execution';
import type { RepairFacts } from './repair';
import { resolve, type DeclaredFacts } from './resolve';
import { skillLookupSection, skillStateSection } from './skill-state';
import { resolveStack } from './stack';
import { evaluateWorkflowGate } from '../workflow/gates';
import { skillReference } from './skill-reference';

// `io` is the third argument for the arms whose answer is about the caller's
// tree rather than the registries alone: resolve-stack defaults its directory to
// the repo root of cwd, and the prompt arms read that same repository's stack to
// rebind stack-bearing intents. Every other arm reads only ctx and args.
type Sub = (ctx: KernelContext, args: string[], io: Io) => unknown;

// bash bound "--prompt" to $1 and discarded the real argument, so route-intent
// answered about the literal string "--prompt". A resolver returning a confident
// wrong answer is worse than one that refuses; the three messages are the bash
// ones, verbatim.
export function requirePositional(cmd: string, what: string, args: string[]): string {
  const first = args[0];
  if (first === undefined || first === '') throw new KernelError(`${cmd} requires ${what}`);
  if (first.startsWith('-')) throw new KernelError(`${cmd} takes ${what} as a positional argument, not a flag (got ${first})`);
  if (args.length !== 1) throw new KernelError(`${cmd} takes exactly one argument, got ${args.length}`);
  return first;
}

export function parseFlags(cmd: string, args: string[], allowed: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const rest = [...args];
  for (;;) {
    const flag = rest.shift();
    if (flag === undefined) break;
    if (!allowed.includes(flag)) throw new KernelError(`${cmd}: unknown flag ${flag}`);
    const value = rest.shift();
    if (value === undefined) throw new KernelError(`${cmd}: ${flag} requires a value`);
    out.set(flag, value);
  }
  return out;
}

// Projection table: each arm parses its flags into DeclaredFacts, calls resolve
// once, and emits its section with the legacy key order. `resolve` is the one
// arm with no legacy counterpart: it emits the sparse Answer itself.
const SUBCOMMANDS: Record<string, Sub> = {
  'route-path': (ctx, args) => routePathSection(ctx, requirePositional('route-path', 'a file path', args)),
  'route-intent': (ctx, args, io) =>
    routeIntentSection(withProject(ctx, io), requirePositional('route-intent', 'the request text', args)),
  model: modelProjection,
  risk: riskProjection,
  gates: gatesProjection,
  repair: repairProjection,
  admit: admitProjection,
  breaker: breakerProjection,
  hitl: hitlProjection,
  waves: wavesProjection,
  execution: executionProjection,
  'skill-reference': (ctx, args) => {
    const flags = parseFlags('skill-reference', args, ['--id']);
    return skillReference(ctx.root, flags.get('--id') ?? '');
  },
  'workflow-gate': (_ctx, args) => {
    const flags = parseFlags('workflow-gate', args, ['--facts']);
    const raw = flags.get('--facts');
    if (raw !== undefined && raw.length > 65536) throw new KernelError('workflow-gate facts exceed 64 KiB');
    let facts: unknown = {};
    try { if (raw !== undefined) facts = JSON.parse(raw); } catch { throw new KernelError('workflow-gate --facts must be a JSON object'); }
    return {...evaluateWorkflowGate(facts), enforcement: 'host-attestation-only'};
  },
  'decision-rules': decisionRulesProjection,
  scale: scaleProjection,
  'route-escalate': (ctx, args, io) => routeEscalateProjection(withProject(ctx, io), args),
  'resolve-task': (ctx, args, io) => resolveTaskProjection(withProject(ctx, io), args),
  resolve: (ctx, args, io) => resolveProjection(withProject(ctx, io), args),
  'skill-state': skillStateProjection,
  'resolve-stack': resolveStackProjection,
};

export function runKernel(argv: string[], io: Io): number {
  const [name, ...args] = argv;
  try {
    const sub = name === undefined ? undefined : SUBCOMMANDS[name];
    if (sub === undefined) throw new KernelError(`unknown subcommand: ${name ?? ''}`);
    const root = resolveRoot(io.env);
    const ctx: KernelContext = { root, registries: lazyRegistries(root) };
    writeJson(io, sub(ctx, args, io));
    return 0;
  } catch (e) {
    if (e instanceof KernelError) {
      writeJson(io, { error: e.message });
      return 1;
    }
    throw e;
  }
}

// The caller's repository for the prompt arms: the repo root of cwd — the
// directory resolve-stack answers for by default, so `resolve-stack` and the
// rebind a prompt arm applies read one stack. Unlike resolve-stack there is no
// fallback to cwd outside a work tree: the rebind walks the tree, and walking an
// arbitrary directory ($HOME, `/`) on every prompt would cost more than the
// floor is worth, so outside a repository no stack is known and nothing is
// rebound. Resolved per prompt arm only: route-path and the policy arms never
// read the stack and never pay for the git call.
function withProject(ctx: KernelContext, io: Io): KernelContext {
  const cwd = io.cwd();
  const project = repoRoot(cwd, spawnSync);
  return project === null ? ctx : { ...ctx, project, projectCwd: cwd };
}

function routePathSection(ctx: KernelContext, file: string): unknown {
  const section = resolve({ path: file }, ctx).route;
  // resolve answers a section for every fact it accepts; an absent one here
  // would mean the projection declared a fact the kernel does not read.
  if (section === undefined) throw new KernelError('route-path: the kernel answered no route section');
  return section;
}

function routeIntentSection(ctx: KernelContext, text: string): unknown {
  const section = resolve({ prompt: text }, ctx).route;
  if (section === undefined) throw new KernelError('route-intent: the kernel answered no route section');
  return section;
}

// bash bound each flag's value with ${2:-}, so an absent flag and an empty value
// reached the same guard and produced the same message. The four arms below keep
// that: emptiness is missingness, reported with the legacy wording.
function modelProjection(ctx: KernelContext, args: string[]): unknown {
  const flags = parseFlags('model', args, ['--work']);
  const work = flags.get('--work');
  if (work === undefined || work === '') throw new KernelError('model requires --work <type>');
  const section = resolve({ workType: work }, ctx).model;
  if (section === undefined) throw new KernelError('model: the kernel answered no model section');
  return section;
}

function riskProjection(ctx: KernelContext, args: string[]): unknown {
  const flags = parseFlags('risk', args, ['--signals']);
  const signals = flags.get('--signals');
  if (signals === undefined || signals === '') throw new KernelError('risk requires --signals <json>');
  const section = resolve({ signals: parseSignals(signals) }, ctx).risk;
  // The classified form is the one a signals fact answers; narrowing on its own
  // key keeps the projection honest if the union ever grows a third form.
  if (section === undefined || !('floors_applied' in section)) {
    throw new KernelError('risk: the kernel answered no classified risk section');
  }
  return {
    risk: section.risk,
    autonomy_ceiling: section.autonomy_ceiling,
    gates: section.gates,
    floors_applied: section.floors_applied,
  };
}

// No gates module exists: cmd_gates and cmd_risk read the same policy block, so
// this arm is a projection of the risk section for an already-classified tier.
function gatesProjection(ctx: KernelContext, args: string[]): unknown {
  const flags = parseFlags('gates', args, ['--risk']);
  const tier = flags.get('--risk');
  // bash's case statement gave absent, empty and unrecognized tiers one message.
  if (tier === undefined || !isRiskTier(tier)) throw new KernelError('gates requires --risk low|medium|high');
  const section = resolve({ riskTier: tier }, ctx).risk;
  if (section === undefined || !('spec_threshold' in section)) {
    throw new KernelError('gates: the kernel answered no classified-tier risk section');
  }
  return { risk: section.risk, gates: section.gates, spec_threshold: section.spec_threshold };
}

function repairProjection(ctx: KernelContext, args: string[]): unknown {
  const flags = parseFlags('repair', args, ['--check', '--attempt', '--situation']);
  const check = flags.get('--check');
  if (check === undefined || check === '') throw new KernelError('repair requires --check');
  const repair: RepairFacts = { check };
  const attempt = flags.get('--attempt');
  if (attempt !== undefined) repair.attempt = parseCount(attempt);
  const situation = flags.get('--situation');
  if (situation !== undefined && situation !== '') repair.situation = situation;
  const section = resolve({ repair }, ctx).repair;
  if (section === undefined) throw new KernelError('repair: the kernel answered no repair section');
  return section;
}

// The bash arm checked its counts AFTER parsing, so an absent flag, an empty
// value and a non-numeric one reached one guard and got one message. Both counts
// are therefore always declared, and a value that is not digits travels as NaN to
// the admit section, which owns the message for every one of those three.
function admitProjection(ctx: KernelContext, args: string[]): unknown {
  const flags = parseFlags('admit', args, ['--inflight', '--queued']);
  const admit = {
    inflight: parseCount(flags.get('--inflight')),
    queued: parseCount(flags.get('--queued')),
  };
  const section = resolve({ admit }, ctx).admit;
  if (section === undefined) throw new KernelError('admit: the kernel answered no admit section');
  return section;
}

// Which fact a state needs is the state's own business (src/kernel/breaker.ts),
// so this arm declares only what was passed and lets the section refuse what the
// state requires and did not get. A --cooldown-elapsed that spells neither
// boolean is left UNDECLARED rather than coerced: the section's message for an
// absent one is the bash message for a bogus one, and the state that does not
// read the flag ignores it either way.
function breakerProjection(ctx: KernelContext, args: string[]): unknown {
  const flags = parseFlags('breaker', args, ['--state', '--failures', '--cooldown-elapsed', '--probe-result']);
  const breaker: BreakerFacts = { state: flags.get('--state') ?? '' };
  const failures = flags.get('--failures');
  if (failures !== undefined) breaker.failures = parseCount(failures);
  const cooldown = flags.get('--cooldown-elapsed');
  if (cooldown === 'true' || cooldown === 'false') breaker.cooldownElapsed = cooldown === 'true';
  const probe = flags.get('--probe-result');
  if (probe !== undefined) breaker.probeResult = probe;
  const section = resolve({ breaker }, ctx).breaker;
  if (section === undefined) throw new KernelError('breaker: the kernel answered no breaker section');
  return section;
}

// Every value but the tier travels as the raw flag string: the bash arm's own
// case statements are ported into the hitl section, so its verbatim messages
// live in one place rather than once per caller. The tier is narrowed here
// because the section's fact type is the tier union, and bash gave an absent,
// empty and unrecognized tier the same message.
function hitlProjection(ctx: KernelContext, args: string[]): unknown {
  const flags = parseFlags('hitl', args, ['--risk', '--autonomy', '--evidence', '--external-effect', '--conflict', '--situation']);
  const tier = flags.get('--risk');
  if (tier === undefined || !isRiskTier(tier)) throw new KernelError('hitl requires --risk low|medium|high');
  const hitl: HitlFacts = { riskTier: tier, autonomy: flags.get('--autonomy') ?? '' };
  const evidence = flags.get('--evidence');
  if (evidence !== undefined) hitl.evidence = evidence;
  const external = flags.get('--external-effect');
  if (external !== undefined) hitl.externalEffect = external;
  const conflict = flags.get('--conflict');
  if (conflict !== undefined) hitl.conflict = conflict;
  const situation = flags.get('--situation');
  if (situation !== undefined) hitl.situation = situation;
  const section = resolve({ hitl }, ctx).hitl;
  if (section === undefined) throw new KernelError('hitl: the kernel answered no hitl section');
  return section;
}

function wavesProjection(ctx: KernelContext, args: string[]): unknown {
  const flags = parseFlags('waves', args, ['--units']);
  const units = flags.get('--units');
  if (units === undefined || units === '') throw new KernelError('waves requires --units <json array>');
  const section = resolve({ waves: { units: parseUnitsJson(units) } }, ctx).waves;
  if (section === undefined) throw new KernelError('waves: the kernel answered no waves section');
  return section;
}

function executionProjection(ctx: KernelContext, args: string[]): unknown {
  const flags = parseFlags('execution', args, ['--facts']);
  const raw = flags.get('--facts');
  let value: unknown = {};
  if (raw !== undefined) {
    try { value = JSON.parse(raw); } catch { throw new KernelError('execution --facts must be a JSON object'); }
  }
  return resolve({ execution: parseExecutionFacts(value) }, ctx).execution;
}

// The four prompt arms bound their flag with ${2:-} and then checked it with
// `[ -n ... ]`, so an absent flag and an empty value reached one guard and got
// one message per arm. The message is the arm's own name, verbatim.
function promptOf(cmd: string, args: string[]): string {
  const flags = parseFlags(cmd, args, ['--prompt']);
  const prompt = flags.get('--prompt');
  if (prompt === undefined || prompt === '') throw new KernelError(`${cmd} requires --prompt <text>`);
  return prompt;
}

function decisionRulesProjection(ctx: KernelContext, args: string[]): unknown {
  const prompt = promptOf('decision-rules', args);
  const section = resolve({ decisions: { prompt } }, ctx).decision_rules;
  if (section === undefined) throw new KernelError('decision-rules: the kernel answered no decision-rules section');
  return section;
}

function scaleProjection(ctx: KernelContext, args: string[]): unknown {
  const prompt = promptOf('scale', args);
  const section = resolve({ scale: { prompt } }, ctx).scale;
  if (section === undefined) throw new KernelError('scale: the kernel answered no scale section');
  return section;
}

// The escalate composite is a FORM of the route section, so this arm declares
// the modifier that selects it and narrows on the key only that form carries.
function routeEscalateProjection(ctx: KernelContext, args: string[]): unknown {
  const prompt = promptOf('route-escalate', args);
  const section = resolve({ prompt, escalate: true }, ctx).route;
  if (section === undefined || !('escalate' in section)) {
    throw new KernelError('route-escalate: the kernel answered no escalate route section');
  }
  return section;
}

// The legacy composite: four sections of one Answer, re-ordered into the key
// order the bash arm emitted. `hitl` is null rather than absent — a projection
// emits every key its callers parse — and it is narrowed to the two fields the
// bash arm published, not the whole section.
function resolveTaskProjection(ctx: KernelContext, args: string[]): unknown {
  const prompt = promptOf('resolve-task', args);
  const answer = resolve({ prompt, taskContract: true }, ctx);
  const contract = answer.task_contract;
  const route = answer.route;
  const decisions = answer.decision_rules;
  if (contract === undefined || decisions === undefined || route === undefined || !('escalate' in route)) {
    throw new KernelError('resolve-task: the kernel answered no task contract');
  }
  const hitl = answer.hitl;
  return {
    task_contract: contract,
    route,
    decision_rules: decisions,
    hitl: hitl === undefined ? null : { required: hitl.required, reasons: hitl.reasons },
  };
}

// The one arm that is not a projection: it declares the facts it was given and
// emits the sparse Answer verbatim, so a caller that needs four sections pays
// for one process instead of four.
function resolveProjection(ctx: KernelContext, args: string[]): unknown {
  const flags = parseFlags('resolve', args, ['--facts']);
  const facts = flags.get('--facts');
  if (facts === undefined || facts === '') throw new KernelError('resolve requires --facts <json>');
  return resolve(parseFacts(facts), ctx);
}

// NOT a projection of `resolve`: skill enablement is a fact about the tree, not
// about a prompt or a path, and the bash kernel answered it from its own arm for
// the same reason. The flag loop is hand-rolled rather than parseFlags because
// the bash message for an unrecognised argument here is "unknown argument", and
// that string is what the parity suite compares.
function skillStateProjection(ctx: KernelContext, args: string[]): unknown {
  let id = '';
  const rest = [...args];
  for (;;) {
    const flag = rest.shift();
    if (flag === undefined) break;
    if (flag !== '--id') throw new KernelError(`skill-state: unknown argument ${flag}`);
    const value = rest.shift();
    // bash bound ${2:-} and then `shift 2` ran off the end, so `--id` with no
    // value spun its own loop forever: there is no legacy answer to be faithful
    // to, and refusing beats answering about a skill nobody named.
    if (value === undefined) throw new KernelError('skill-state: --id requires a value');
    id = value;
  }
  const state = ctx.registries.skillState;
  // bash tested `[ -n "$id" ]`, so an explicitly empty --id selected the list
  // form exactly as an absent one did.
  return id === '' ? skillStateSection(state) : skillLookupSection(state, id);
}

// NOT a projection of `resolve` either: the stack is a fact about the caller's
// repo, not about a prompt or a path, and the registries play no part in it.
// `[dir]` is optional — the one positional in this table that is — and defaults
// to the repo root of cwd (or cwd itself outside a work tree). The answer's
// `source` says whether .engineos/config.json spoke or the tree was detected.
function resolveStackProjection(_ctx: KernelContext, args: string[], io: Io): unknown {
  const first = args[0];
  if (first !== undefined && first.startsWith('-')) {
    throw new KernelError(`resolve-stack takes a directory as a positional argument, not a flag (got ${first})`);
  }
  if (args.length > 1) throw new KernelError(`resolve-stack takes at most one argument, got ${args.length}`);
  const cwd = io.cwd();
  const dir = first === undefined || first === '' ? repoRoot(cwd, spawnSync) ?? cwd : resolvePath(cwd, first);
  if (!isDirectory(dir)) throw new KernelError(`resolve-stack: ${dir} is not a directory`);
  const { packages, source } = resolveStack(dir, loadProjectConfig(dir));
  return { packages, source };
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// The fact vocabulary, read key by key rather than cast: an unknown key is a
// caller asking a question this kernel does not answer, and accepting it
// silently would report the absence of a section as the absence of an answer.
function parseFacts(raw: string): DeclaredFacts {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new KernelError('resolve --facts must be a JSON object');
  }
  if (!isRecord(parsed)) throw new KernelError('resolve --facts must be a JSON object');
  const facts: DeclaredFacts = {};
  for (const [key, value] of Object.entries(parsed)) {
    switch (key) {
      case 'path': facts.path = factString(key, value); break;
      case 'prompt': facts.prompt = factString(key, value); break;
      case 'escalate': facts.escalate = factBoolean(key, value); break;
      case 'taskContract': facts.taskContract = factBoolean(key, value); break;
      case 'workType': facts.workType = factString(key, value); break;
      // Passed through unread, exactly as the risk arm passes its parsed
      // --signals payload: the risk section owns what a well-formed one is.
      case 'signals': facts.signals = value; break;
      case 'riskTier': facts.riskTier = factTier(key, value); break;
      case 'scale': facts.scale = { prompt: factString('scale.prompt', factRecord(key, value)['prompt']) }; break;
      case 'decisions': facts.decisions = { prompt: factString('decisions.prompt', factRecord(key, value)['prompt']) }; break;
      case 'repair': facts.repair = repairFacts(factRecord(key, value)); break;
      case 'admit': facts.admit = admitFacts(factRecord(key, value)); break;
      case 'breaker': facts.breaker = breakerFacts(factRecord(key, value)); break;
      case 'hitl': facts.hitl = hitlFacts(factRecord(key, value)); break;
      // `units` travels unread for the same reason `signals` does; an absent one
      // reaches the waves section, which owns the message for it.
      case 'waves': facts.waves = { units: factRecord(key, value)['units'] }; break;
      case 'execution': facts.execution = parseExecutionFacts(value); break;
      default: throw new KernelError(`resolve --facts: unknown fact ${key}`);
    }
  }
  return facts;
}

function repairFacts(row: Record<string, unknown>): RepairFacts {
  const facts: RepairFacts = { check: factString('repair.check', row['check']) };
  if (row['attempt'] !== undefined) facts.attempt = factNumber('repair.attempt', row['attempt']);
  if (row['situation'] !== undefined) facts.situation = factString('repair.situation', row['situation']);
  return facts;
}

function admitFacts(row: Record<string, unknown>): AdmitFacts {
  return {
    inflight: factNumber('admit.inflight', row['inflight']),
    queued: factNumber('admit.queued', row['queued']),
  };
}

function breakerFacts(row: Record<string, unknown>): BreakerFacts {
  const facts: BreakerFacts = { state: factString('breaker.state', row['state']) };
  if (row['failures'] !== undefined) facts.failures = factNumber('breaker.failures', row['failures']);
  if (row['cooldownElapsed'] !== undefined) {
    facts.cooldownElapsed = factBoolean('breaker.cooldownElapsed', row['cooldownElapsed']);
  }
  if (row['probeResult'] !== undefined) facts.probeResult = factString('breaker.probeResult', row['probeResult']);
  return facts;
}

function hitlFacts(row: Record<string, unknown>): HitlFacts {
  const facts: HitlFacts = {
    riskTier: factTier('hitl.riskTier', row['riskTier']),
    autonomy: factString('hitl.autonomy', row['autonomy']),
  };
  // The three flag-shaped fields keep the section's own vocabulary checks: a
  // string reaches the verbatim bash message, a boolean is what JSON has.
  if (row['evidence'] !== undefined) facts.evidence = factString('hitl.evidence', row['evidence']);
  if (row['externalEffect'] !== undefined) {
    facts.externalEffect = factFlag('hitl.externalEffect', row['externalEffect']);
  }
  if (row['conflict'] !== undefined) facts.conflict = factFlag('hitl.conflict', row['conflict']);
  if (row['situation'] !== undefined) facts.situation = factString('hitl.situation', row['situation']);
  // The topology fact (policy.json hitl.reasons topology-approval) reaches the
  // CLI only through --facts; resolve-task sets it in-process from
  // rule-multi-agent-design. Dropping an unknown key here would silently lose
  // the one reason a design review owes.
  if (row['topology'] !== undefined) facts.topology = factFlag('hitl.topology', row['topology']);
  return facts;
}

function factRecord(at: string, value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new KernelError(`resolve --facts: ${at} must be an object`);
  return value;
}

function factString(at: string, value: unknown): string {
  if (typeof value !== 'string') throw new KernelError(`resolve --facts: ${at} must be a string`);
  return value;
}

function factBoolean(at: string, value: unknown): boolean {
  if (typeof value !== 'boolean') throw new KernelError(`resolve --facts: ${at} must be a boolean`);
  return value;
}

function factNumber(at: string, value: unknown): number {
  if (typeof value !== 'number') throw new KernelError(`resolve --facts: ${at} must be a number`);
  return value;
}

function factFlag(at: string, value: unknown): boolean | string {
  if (typeof value !== 'boolean' && typeof value !== 'string') {
    throw new KernelError(`resolve --facts: ${at} must be a boolean or a string`);
  }
  return value;
}

function factTier(at: string, value: unknown): RiskTier {
  if (!isRiskTier(value)) throw new KernelError(`resolve --facts: ${at} must be low|medium|high`);
  return value;
}

function parseSignals(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new KernelError('risk --signals is not valid JSON');
  }
}

// bash fed every count through a digits-only case statement before using it, so
// "1abc" was refused rather than read as 1 and "02" normalised to 2.
// Number.parseInt alone would read both, so the digits are checked first and a
// refusal travels as NaN to the section, which owns the message for its own
// non-numeric value. An absent flag is the same NaN for the arms whose bash
// counterpart bound "" and checked it in the same place.
function parseCount(raw: string | undefined): number {
  if (raw === undefined) return Number.NaN;
  return /^[0-9]+$/.test(raw) ? Number.parseInt(raw, 10) : Number.NaN;
}

// bash piped --units into `jq -e 'type == "array"'`, so a payload that is not
// JSON at all and one that is JSON but not an array failed the same guard with
// the same message.
function parseUnitsJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new KernelError('waves --units must be a JSON array');
  }
}
