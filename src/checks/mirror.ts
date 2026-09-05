// The rule-to-registry mirror runner (design "Mirror table"). Fifteen bash
// checks each re-derived section slicing and the vacuous-grep defence; the
// rationale for all of it lives here, once, and nowhere else.
//
// Why a section and not the file: a mirror row claims that ONE passage names
// what the registry declares. A file-wide grep still passes with that passage
// deleted, because the same word occurs in a neighbouring paragraph — C25c and
// C26c both carry a comment describing exactly that near-miss. So the anchor
// section is the default and `scope: 'file'` is an explicit, per-row opt-in.
//
// Why an empty section is a failure rather than a pass: an anchor that survives
// with its body gone satisfies every "the element is absent" test vacuously.
// The same reasoning makes an empty registry list a failure: zero elements
// means zero assertions, which is a check that cannot fail and therefore
// reports nothing. Both are findings, never silent passes.
//
// Why `both` slices the reverse: forward alone says the registry's vocabulary
// is documented; it says nothing about a row the prose invented, which is how a
// closed vocabulary quietly grows a member the kernel never answers. The
// reverse capture class is narrow on purpose ([A-Za-z0-9@_./:-]+, the telemetry
// slug class) — multi-word headings are not reversible, and a row whose
// elements contain spaces must stay one-directional rather than match nothing
// and call it agreement.
//
// Why a missing placeholder is a throw and not a finding: an element without
// {x} matches the same text for every element, so the row would pass whatever
// the registry says. That is a bug in the table, not a fact about the tree.
import { KernelError, isRecord, readJsonFile } from '../lib/json';
import { registryPath, type RegistryName as RegistryFileName } from '../registry/load';
import type { Finding } from './findings';
import type { CheckContext } from './lib';
import type { MirrorPair, RegistryName, RegistryPath } from './mirrors';

// The reverse-direction capture class: the telemetry slug class, which is what
// a registry id is allowed to be.
const CAPTURE = '([A-Za-z0-9@_./:-]+)';

type NamesRow = Extract<MirrorPair, { kind: 'names' }>;
type QuotesRow = Extract<MirrorPair, { kind: 'quotes' }>;

const REGISTRY_FILE_BY_NAME: Record<RegistryName, RegistryFileName> = {
  routing: 'routing.json',
  intents: 'intents.json',
  models: 'models.json',
  policy: 'policy.json',
  decisionRules: 'decision-rules.json',
  capabilities: 'capabilities.json',
  agents: 'agents.json',
};

// Entries rather than a typed index so a path's registry name — a plain string
// at runtime — is looked up without an assertion.
const REGISTRY_FILES = new Map<string, RegistryFileName>(Object.entries(REGISTRY_FILE_BY_NAME));

// name, then an optional selector: `[]` maps over an array, `[id=x]` picks the
// one element of an array whose id field is x.
const SEGMENT = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[\]|\[id=([^\]]+)\])?$/;

export function resolveRegistryPath(root: string, path: RegistryPath): string[] {
  const dot = path.indexOf('.');
  if (dot <= 0) throw new KernelError(`registry path '${path}' names no registry`);
  const name = path.slice(0, dot);
  const file = REGISTRY_FILES.get(name);
  if (file === undefined) throw new KernelError(`registry path '${path}' names an unknown registry '${name}'`);
  let cursor: unknown[] = [readJsonFile(registryPath(root, file))];
  for (const segment of path.slice(dot + 1).split('.')) {
    cursor = step(cursor, segment, path);
  }
  const values: string[] = [];
  for (const value of cursor) {
    if (Array.isArray(value)) for (const element of value) values.push(scalar(element, path));
    else values.push(scalar(value, path));
  }
  return values;
}

export function sliceSection(text: string, anchor: string): string | undefined {
  const lines = text.split('\n');
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== undefined && line.trimEnd() === anchor) {
      start = index + 1;
      break;
    }
  }
  if (start === -1) return undefined;
  const body: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.startsWith('## ')) break;
    body.push(line);
  }
  return body.join('\n');
}

export function runMirrors(rows: readonly MirrorPair[], ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];
  for (const row of rows) findings.push(...runRow(row, ctx));
  return findings;
}

// ------------------------------------------------------------------ internals

function runRow(row: MirrorPair, ctx: CheckContext): Finding[] {
  assertPlaceholder(row);
  const text = ctx.readText(row.doc);
  if (text === undefined) return [fail(row, `doc-missing:${row.doc}`)];
  const haystack = sliceHaystack(row, text);
  if (typeof haystack !== 'string') return [fail(row, haystack.subject)];
  let values: string[];
  try {
    values = resolveRegistryPath(ctx.root, row.registry);
  } catch {
    return [fail(row, `registry-empty:${row.registry}`)];
  }
  if (values.length === 0) return [fail(row, `registry-empty:${row.registry}`)];
  return row.kind === 'names' ? names(row, haystack, values) : quotes(row, haystack, values);
}

function sliceHaystack(row: MirrorPair, text: string): string | { subject: string } {
  if (row.scope === 'file') return text;
  const anchor = row.anchor;
  if (anchor === undefined) throw new KernelError(`mirror row '${row.id}' has no anchor and is not scope: 'file'`);
  const section = sliceSection(text, anchor);
  if (section === undefined) return { subject: `section-missing:${anchor}` };
  if (section.trim() === '') return { subject: `section-empty:${anchor}` };
  return section;
}

function names(row: NamesRow, haystack: string, values: string[]): Finding[] {
  const findings: Finding[] = [];
  if (row.direction !== 'registry-names-doc') {
    for (const value of values) {
      const pattern = new RegExp(fill(row.element, '{x}', escapeRegExp(value)), flags(row, 'm'));
      if (!pattern.test(haystack)) findings.push(fail(row, value));
    }
  }
  if (row.direction !== 'doc-names-registry') {
    const declared = new Set(values.map((value) => normalize(row, value)));
    const pattern = new RegExp(fill(row.element, '{x}', CAPTURE), flags(row, 'gm'));
    for (const match of haystack.matchAll(pattern)) {
      const captured = match[1];
      if (captured !== undefined && !declared.has(normalize(row, captured))) {
        findings.push(fail(row, `undeclared:${captured}`));
      }
    }
  }
  return findings;
}

function quotes(row: QuotesRow, haystack: string, values: string[]): Finding[] {
  if (values.length > 1) return [fail(row, `registry-ambiguous:${row.registry}`)];
  const expected = values[0];
  if (expected === undefined) return [fail(row, `registry-empty:${row.registry}`)];
  const pattern = new RegExp(fill(row.pattern, '{n}', '(\\d+)'), flags(row, 'gm'));
  const captured = [...haystack.matchAll(pattern)].map((match) => match[1]).filter((n): n is string => n !== undefined);
  if (captured.length === 0) return [fail(row, 'pattern-missing')];
  if (captured.length > 1) return [fail(row, 'pattern-ambiguous')];
  const found = captured[0];
  if (found === undefined || found === expected) return [];
  return [fail(row, `${found}!=${expected}`)];
}

function assertPlaceholder(row: MirrorPair): void {
  const source = row.kind === 'names' ? row.element : row.pattern;
  const placeholder = row.kind === 'names' ? '{x}' : '{n}';
  if (!source.includes(placeholder)) {
    throw new KernelError(`mirror row '${row.id}' has no ${placeholder} placeholder, so it would match vacuously`);
  }
}

function step(cursor: unknown[], segment: string, path: RegistryPath): unknown[] {
  const parsed = SEGMENT.exec(segment);
  const key = parsed?.[1];
  if (parsed === null || key === undefined) throw new KernelError(`registry path '${path}' has an unreadable segment '${segment}'`);
  const wanted = parsed[2];
  const mapped = segment.endsWith('[]');
  const next: unknown[] = [];
  for (const value of cursor) {
    if (!isRecord(value)) throw new KernelError(`registry path '${path}': '${key}' has no object to read from`);
    const child = value[key];
    if (child === undefined || child === null) throw new KernelError(`registry path '${path}' has no segment '${key}'`);
    if (wanted !== undefined) next.push(selectById(child, wanted, key, path));
    else if (mapped) next.push(...asArray(child, key, path));
    else next.push(child);
  }
  return next;
}

function asArray(child: unknown, key: string, path: RegistryPath): unknown[] {
  if (!Array.isArray(child)) throw new KernelError(`registry path '${path}': '${key}' is not an array`);
  return child;
}

function selectById(child: unknown, wanted: string, key: string, path: RegistryPath): unknown {
  for (const element of asArray(child, key, path)) {
    if (isRecord(element) && element['id'] === wanted) return element;
  }
  throw new KernelError(`registry path '${path}': '${key}' has no element with id '${wanted}'`);
}

function scalar(value: unknown, path: RegistryPath): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  throw new KernelError(`registry path '${path}' does not end on a scalar`);
}

function fail(row: MirrorPair, subject: string): Finding {
  return { code: row.id, subject };
}

// A replacer function rather than a replacement string: a registry value
// carrying '$&' would otherwise be re-expanded by String.replace.
function fill(source: string, placeholder: string, replacement: string): string {
  return source.replace(placeholder, () => replacement);
}

// Case folding is a per-row property because two of today's mirrors are
// case-insensitive in bash (C19c lowercases both sides; the gate ladder is
// rendered in Title Case and declared in lower case).
function flags(row: MirrorPair, base: string): string {
  return row.ignoreCase === true ? `${base}i` : base;
}

function normalize(row: MirrorPair, value: string): string {
  return row.ignoreCase === true ? value.toLowerCase() : value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
