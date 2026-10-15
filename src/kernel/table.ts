import { KernelError, isRecord } from '../lib/json';

// Decision tables whose rows live in registries/policy.json. A row's `when` is a
// conjunction over named facts the calling arm measures: the registry owns the
// rows, their order and their prose; the arm owns only how each fact is
// computed. FIRST answers the first matching row (a ladder), COLLECT every one.
export type Fact = string | boolean | null;

// A scalar equals the fact; a list holds it; `in` names a set the arm supplies
// (a row says "a retry.never_retry id" without restating that list); `at_least`
// holds at or above a value in the arm's declared order for that fact.
export type Condition = string | boolean | readonly string[] | { readonly in: string } | { readonly at_least: string };
export type When = Readonly<Record<string, Condition>>;

type Lists = Readonly<Record<string, readonly string[]>>;
export interface Vocabulary { readonly facts: readonly string[]; readonly sets?: Lists; readonly orders?: Lists }
export interface TableInput extends Omit<Vocabulary, 'facts'> { readonly facts: Readonly<Record<string, Fact>> }

export function evaluateFirst<R extends { readonly when: When }>(rows: readonly R[], input: TableInput): R | undefined {
  requireResolvable(rows.map((row) => row.when), input);
  return rows.find((row) => matches(row.when, input));
}

export function evaluateCollect<R extends { readonly when: When }>(rows: readonly R[], input: TableInput): R[] {
  requireResolvable(rows.map((row) => row.when), input);
  return rows.filter((row) => matches(row.when, input));
}

// Fail closed before answering: a row naming a fact, set or order the arm never
// supplies is a malformed table, and reading it as false would drop a reason.
export function requireResolvable(whens: readonly When[], input: TableInput): void {
  const problem = whens.flatMap((when) => whenProblems(when, { ...input, facts: Object.keys(input.facts) }))[0];
  if (problem !== undefined) throw new KernelError(`policy table: ${problem}`);
}

export function matches(when: When, input: TableInput): boolean {
  return Object.entries(when).every(([name, condition]) => {
    const fact = own(input.facts, name) ?? null;
    if (typeof condition !== 'object') return fact === condition;
    if (typeof fact !== 'string') return false;
    if (isList(condition)) return condition.includes(fact);
    if ('in' in condition) return (own(input.sets ?? {}, condition.in) ?? []).includes(fact);
    const order = own(input.orders ?? {}, name) ?? [];
    return order.indexOf(fact) >= order.indexOf(condition.at_least);
  });
}

export function whenProblems(when: When, vocabulary: Vocabulary): string[] {
  return Object.entries(when).flatMap(([name, condition]): string[] => {
    if (!vocabulary.facts.includes(name)) return [`unknown fact ${name}`];
    if (typeof condition !== 'object' || isList(condition)) return [];
    if ('in' in condition) return own(vocabulary.sets ?? {}, condition.in) === undefined ? [`unknown set ${condition.in}`] : [];
    return (own(vocabulary.orders ?? {}, name) ?? []).includes(condition.at_least) ? [] : [`${name} has no order containing ${condition.at_least}`];
  });
}

// A raw registry `when` becomes typed conditions, or the problem to report.
export function parseWhen(value: unknown): When | string {
  if (!isRecord(value)) return 'must be an object';
  const when: Record<string, Condition> = {};
  for (const [name, raw] of Object.entries(value)) {
    const condition = parseCondition(raw);
    if (condition === undefined) return `${name} must be a string, boolean, string array, {"in": <set>} or {"at_least": <value>}`;
    when[name] = condition;
  }
  return when;
}

function parseCondition(raw: unknown): Condition | undefined {
  if (typeof raw === 'string' || typeof raw === 'boolean') return raw;
  if (Array.isArray(raw)) {
    const items = raw.filter((item): item is string => typeof item === 'string');
    return items.length === raw.length ? items : undefined;
  }
  if (!isRecord(raw) || Object.keys(raw).length !== 1) return undefined;
  const [set, floor] = [raw['in'], raw['at_least']];
  if (typeof set === 'string') return { in: set };
  return typeof floor === 'string' ? { at_least: floor } : undefined;
}
const PLACEHOLDER = /\{([a-z_]+)\}/g;

// Registry prose carries `{name}` slots for the numbers an answer reports; an
// unknown slot throws rather than shipping literal braces to a caller.
export function fillTemplate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(PLACEHOLDER, (_slot, name: string) => {
    const value = own(values, name);
    if (value === undefined) throw new KernelError(`policy template names an unknown placeholder: {${name}}`);
    return String(value);
  });
}

export const placeholdersOf = (template: string): string[] => [...template.matchAll(PLACEHOLDER)].map((slot) => slot[1] ?? '');

const isList = (condition: Condition): condition is readonly string[] => Array.isArray(condition);

// Own keys only: a registry string such as "constructor" must not resolve to a prototype member.
function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
