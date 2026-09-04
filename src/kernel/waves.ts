import { KernelError, isRecord } from '../lib/json';
import type { Registries } from './context';

// rules/parallelism.md steps 1-4, mechanically: Kahn-layer the dependency graph
// (a cycle is an error, never a silently empty wave list), flag same-file
// ownership inside a wave (the "no two agents write the same file" hard rule),
// split any layer wider than the policy cap, and emit the announcement line the
// rules require.
export interface WavesFacts {
  // The parsed payload of --units: [{id, files?, depends_on?}]. Parsing the
  // flag's string is the CLI's job; validating the shape is this module's,
  // because a unit the kernel cannot read is a wave plan answered on input it
  // did not understand.
  units: unknown;
}

export interface WaveViolation {
  file: string;
  units: string[];
}

// cmd_waves' key order: waves, violations, fanout_line.
export interface WavesSection {
  waves: string[][];
  violations: WaveViolation[];
  fanout_line: string;
}

interface Unit {
  id: string;
  files: string[];
  dependsOn: string[];
}

export function wavesSection(facts: WavesFacts, regs: Registries): WavesSection {
  const cap = regs.policy.parallelism.wave_concurrency_cap;
  if (!Number.isInteger(cap) || cap < 1) {
    throw new KernelError(
      `policy.json .parallelism.wave_concurrency_cap must be a positive integer, not ${String(cap)}`,
    );
  }
  const units = parseUnits(facts.units);

  const ids = units.map((unit) => unit.id);
  if (new Set(ids).size !== ids.length) throw new KernelError('duplicate unit ids');
  const unknown = unique(units.flatMap((unit) => unit.dependsOn.filter((dep) => !ids.includes(dep))));
  if (unknown.length > 0) {
    throw new KernelError(`depends_on references unknown unit(s): ${unknown.join(', ')}`);
  }

  const layers = kahnLayers(units);
  const violations = layers.flatMap(sameFileViolations);
  const waves = layers.flatMap((layer) => chunk(layer, cap)).map((wave) => wave.map((unit) => unit.id));
  return { waves, violations, fanout_line: fanoutLine(waves) };
}

function parseUnits(value: unknown): Unit[] {
  if (!Array.isArray(value)) throw new KernelError('waves --units must be a JSON array');
  const rows: unknown[] = value;
  return rows.map((raw, i) => {
    const malformed = `waves --units[${i}] must be an object with a non-empty string id`;
    if (!isRecord(raw)) throw new KernelError(malformed);
    const id = raw['id'];
    if (typeof id !== 'string' || id === '') throw new KernelError(malformed);
    return {
      id,
      files: stringList(raw['files'], `waves --units[${i}].files must be an array of file paths`),
      dependsOn: stringList(raw['depends_on'], `waves --units[${i}].depends_on must be an array of unit ids`),
    };
  });
}

// jq reads an absent and a null field the same way through `.files[]?`; a
// present field of the wrong type is a malformed unit, not an empty one.
function stringList(value: unknown, message: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new KernelError(message);
  const items: unknown[] = value;
  return items.map((item) => {
    if (typeof item !== 'string') throw new KernelError(message);
    return item;
  });
}

function kahnLayers(units: readonly Unit[]): Unit[][] {
  const layers: Unit[][] = [];
  const done = new Set<string>();
  let remaining = [...units];
  while (remaining.length > 0) {
    const ready = remaining.filter((unit) => unit.dependsOn.every((dep) => done.has(dep)));
    if (ready.length === 0) {
      throw new KernelError(`dependency cycle among: ${remaining.map((unit) => unit.id).join(', ')}`);
    }
    layers.push(ready);
    for (const unit of ready) done.add(unit.id);
    const readyIds = new Set(ready.map((unit) => unit.id));
    remaining = remaining.filter((unit) => !readyIds.has(unit.id));
  }
  return layers;
}

// Two units in one wave owning the same file break the disjoint-scope rule.
// That is reported, not thrown: the wave plan is still the right plan, with the
// collision named so the orchestrator can serialize the pair.
function sameFileViolations(layer: readonly Unit[]): WaveViolation[] {
  const byFile = new Map<string, string[]>();
  for (const unit of layer) {
    for (const file of unit.files) {
      const owners = byFile.get(file);
      if (owners === undefined) byFile.set(file, [unit.id]);
      else owners.push(unit.id);
    }
  }
  return [...byFile.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([file, owners]) => ({ file, units: owners }))
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

function chunk(layer: readonly Unit[], cap: number): Unit[][] {
  const out: Unit[][] = [];
  for (let i = 0; i < layer.length; i += cap) out.push(layer.slice(i, i + cap));
  return out;
}

// The announcement line rules/parallelism.md requires, verbatim in shape: the
// trailing space after the count is what an empty plan answers with.
function fanoutLine(waves: readonly string[][]): string {
  const parts = waves.map((wave, i) => `wave${i + 1}=(${wave.join(', ')})`);
  return `[fanout] waves=${waves.length} ${parts.join(' ')}`;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
