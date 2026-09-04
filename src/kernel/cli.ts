import { writeJson, type Io } from '../io';
import { KernelError } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import type { BreakerFacts } from './breaker';
import { isRiskTier, lazyRegistries, type KernelContext } from './context';
import type { HitlFacts } from './hitl';
import type { RepairFacts } from './repair';
import { resolve } from './resolve';

type Sub = (ctx: KernelContext, args: string[]) => unknown;

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
// once, and emits its section with the legacy key order. Task 12 adds the rest.
const SUBCOMMANDS: Record<string, Sub> = {
  'route-path': (ctx, args) => routePathSection(ctx, requirePositional('route-path', 'a file path', args)),
  'route-intent': (ctx, args) => routeIntentSection(ctx, requirePositional('route-intent', 'the request text', args)),
  model: modelProjection,
  risk: riskProjection,
  gates: gatesProjection,
  repair: repairProjection,
  admit: admitProjection,
  breaker: breakerProjection,
  hitl: hitlProjection,
  waves: wavesProjection,
};

export function runKernel(argv: string[], io: Io): number {
  const [name, ...args] = argv;
  try {
    const sub = name === undefined ? undefined : SUBCOMMANDS[name];
    if (sub === undefined) throw new KernelError(`unknown subcommand: ${name ?? ''}`);
    const root = resolveRoot(io.env);
    const ctx: KernelContext = { root, registries: lazyRegistries(root) };
    writeJson(io, sub(ctx, args));
    return 0;
  } catch (e) {
    if (e instanceof KernelError) {
      writeJson(io, { error: e.message });
      return 1;
    }
    throw e;
  }
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
