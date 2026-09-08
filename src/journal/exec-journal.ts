import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../lib/json';
import { EXEC_JOURNAL_FIELDS, SLUG_RE, type FieldName, type FieldSpec, type JournalRegistries, type SpanFields } from './schema';

// The append/validate CLI for the exec-journal span schema. Every function here
// walks EXEC_JOURNAL_FIELDS; none of them names a field, with the single
// exception noted at DEFAULTED_FIELD below.

// Plain text on stderr and exit 1 — deliberately NOT the kernel's JSON error
// envelope. A journal CLI's stdout is the journal's own answer; a consumer
// piping it must not have to tell an error object from a line it wrote.
// `usage` asks the caller to print the usage block after the message, which is
// what the bash `usage()` did on an unknown argument.
export class JournalError extends Error {
  readonly kind = 'journal';
  readonly usage: boolean;
  constructor(message: string, opts: { usage?: boolean } = {}) {
    super(message);
    this.usage = opts.usage ?? false;
  }
}

// The one field whose value the CLI supplies when the caller does not. There is
// no room for a per-row default in the frozen FieldSpec, so the exception is
// named once, here, rather than spread through the emitter.
const DEFAULTED_FIELD: FieldName = 'timestamp';

const BY_FLAG = new Map<string, FieldSpec>(EXEC_JOURNAL_FIELDS.map((spec) => [spec.flag, spec]));
const BY_NAME = new Map<string, FieldSpec>(EXEC_JOURNAL_FIELDS.map((spec) => [spec.name, spec]));

export function parseAppendArgs(argv: string[]): { file: string; fields: SpanFields } {
  const [file, ...rest] = argv;
  // bash bound `local file="$1"` under `set -u`, so an append with no arguments
  // died on an unbound variable; the port refuses with the usage block instead.
  if (file === undefined || file === '') throw new JournalError('', { usage: true });
  const fields: SpanFields = {};
  const pending = [...rest];
  for (;;) {
    const flag = pending.shift();
    if (flag === undefined) break;
    // Every flag takes a value. A flag as the last argument would otherwise read
    // past the end and skip the completeness check below.
    const value = pending.shift();
    if (value === undefined) throw new JournalError('', { usage: true });
    const spec = BY_FLAG.get(flag);
    if (spec === undefined) throw new JournalError(`unknown arg: ${flag}`, { usage: true });
    fields[spec.name] = value;
  }
  return { file, fields };
}

// `argv` is the append arm's own argv, file first — the same list
// parseAppendArgs takes; `file` is the write target the caller already resolved
// from it. Both are in the plan's frozen signature, so the fields are re-derived
// here rather than threaded through a second parameter shape.
export function appendLine(root: string, file: string, argv: string[], now: () => string, regs: JournalRegistries): void {
  requireModelsRegistry(root);
  const { fields } = parseAppendArgs(argv);
  // Length FIRST, on every value, before any guard reads one: a 200KB harness
  // value must not become a 200KB journal line through a field whose class
  // would have accepted it. Over-long is a reject, never a truncation — a
  // truncated value that still validates is the same unbounded-input bug with
  // the evidence removed.
  const maxLength = regs.execJournal.max_value_length;
  for (const { spec, text } of setInArgvOrder(fields)) {
    if (text.length > maxLength) {
      throw new JournalError(`${spec.flag} must be at most ${maxLength} characters, got ${text.length}`);
    }
  }
  // Defaulted BEFORE its guard, not after, so the generated stamp goes through
  // the same slug check as a caller-supplied one rather than being trusted for
  // being ours.
  if (unset(fields[DEFAULTED_FIELD])) fields[DEFAULTED_FIELD] = now();
  for (const spec of EXEC_JOURNAL_FIELDS) {
    if (spec.presence === 'required' && unset(fields[spec.name])) throw new JournalError('', { usage: true });
  }
  for (const spec of EXEC_JOURNAL_FIELDS) {
    const value = fields[spec.name];
    if (value === undefined) continue;
    guardValue(spec, String(value), regs);
  }
  writeLine(file, emit(fields));
}

export function validateFile(root: string, file: string, regs: JournalRegistries): { lines: number; bad: number[] } {
  if (!existsSync(file)) throw new JournalError(`no such file: ${file}`);
  requireModelsRegistry(root);
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new JournalError(`no such file: ${file}`);
  }
  const lines = text.split('\n');
  // A file ending in a newline has no final empty record; one that does not
  // still has its last line read, which is what the bash `|| [ -n "$line" ]`
  // guard bought.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const bad: number[] = [];
  lines.forEach((line, index) => {
    if (line === '') return;
    if (!validLine(line, regs)) bad.push(index + 1);
  });
  return { lines: lines.length, bad };
}

export function usage(argv0: string): string {
  const flags = EXEC_JOURNAL_FIELDS.map((spec) => {
    const term = `${spec.flag} ${placeholder(spec)}`;
    return spec.presence === 'required' ? term : `[${term}]`;
  }).join(' ');
  return `usage: ${argv0} append <file> ${flags}\n       ${argv0} validate <file>\n`;
}

// ------------------------------------------------------------------ internals

// An empty value reached the bash completeness test as an absent one, because
// both were `[ -n "$v" ]` against the same empty string.
function unset(value: string | number | boolean | undefined): boolean {
  return value === undefined || value === '';
}

// The rows a parse actually set, in the order the flags appeared: SpanFields is
// built by insertion and carries no integer-like key, so its own key order is
// argv order. The length pass reads it that way so an over-long value is
// reported against the flag the caller typed first, as the bash loop did.
function setInArgvOrder(fields: SpanFields): { spec: FieldSpec; text: string }[] {
  const rows: { spec: FieldSpec; text: string }[] = [];
  for (const [name, value] of Object.entries(fields)) {
    const spec = BY_NAME.get(name);
    if (spec !== undefined && value !== undefined) rows.push({ spec, text: String(value) });
  }
  return rows;
}

function placeholder(spec: FieldSpec): string {
  if (spec.json === 'boolean') return 'true|false';
  if (spec.guard === 'int') return 'N';
  if (spec.guard === 'enum') return 'ENUM';
  if (spec.guard === 'free') return 'TEXT';
  return 'ID';
}

function requireModelsRegistry(root: string): void {
  const path = join(root, 'registries', 'models.json');
  if (!existsSync(path)) throw new JournalError(`no models registry at ${path}`);
}

function guardValue(spec: FieldSpec, value: string, regs: JournalRegistries): void {
  switch (spec.guard) {
    case 'free':
      return;
    case 'slug':
      if (!SLUG_RE.test(value)) throw new JournalError(`${spec.flag} must match ${SLUG_RE.source}, got: ${value}`);
      return;
    case 'int':
      if (!isNonNegativeInt(value)) {
        throw new JournalError(`${spec.flag} must be a non-negative integer, got: ${value}`);
      }
      return;
    case 'bool':
      if (value !== 'true' && value !== 'false') {
        throw new JournalError(`${spec.flag} must be true or false, got: ${value}`);
      }
      return;
    case 'enum': {
      const members = spec.values === undefined ? [] : spec.values(regs);
      if (members.includes(value)) return;
      // The boolean row's members are JSON's two spellings rather than a
      // vocabulary, so it keeps the bash wording for a boolean rather than the
      // "one of" wording every registry-backed row gets.
      if (spec.json === 'boolean') {
        throw new JournalError(`${spec.flag} must be true or false, got: ${value}`);
      }
      throw new JournalError(`invalid ${spec.name}: ${value} (must be one of: ${members.join(' ')})`);
    }
  }
}

// All digits and non-empty: a leading '-' or a '.' is not in [0-9], so negatives
// and fractions are both caught. "03" is accepted and converted, which is a
// digit string but not valid JSON — the conversion is why the emitter never
// hands a raw digit string to the encoder.
function isNonNegativeInt(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

function emit(fields: SpanFields): Record<string, string | number | boolean | null> {
  const row: Record<string, string | number | boolean | null> = {};
  for (const spec of EXEC_JOURNAL_FIELDS) {
    const value = fields[spec.name];
    if (value === undefined) {
      // agent and note keep their explicit nulls because a v1 line always
      // carried both keys; every other unset field is dropped entirely, so a v1
      // line is byte-identical to what v1 wrote.
      if (spec.presence === 'always') row[spec.name] = null;
      continue;
    }
    const text = String(value);
    row[spec.name] = spec.json === 'number'
      ? Number.parseInt(text, 10)
      : spec.json === 'boolean' ? text === 'true' : text;
  }
  return row;
}

function writeLine(file: string, row: Record<string, unknown>): void {
  try {
    appendFileSync(file, `${encode(row)}\n`);
  } catch {
    throw new JournalError(`cannot append to ${file}`);
  }
}

// JSON requires escaping only below U+0020, so JSON.stringify writes DEL raw
// while jq writes it as \u007f. A journal line is a byte contract, and `note`
// is the one field whose class admits the character, so the encoder keeps jq's
// spelling. DEL cannot appear anywhere else in the text: it is not structural,
// and every other field is slug-guarded.
function encode(row: Record<string, unknown>): string {
  return JSON.stringify(row).replace(/\u007f/g, '\\u007f');
}

function validLine(line: string, regs: JournalRegistries): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    return false;
  }
  if (!isRecord(parsed)) return false;
  for (const spec of EXEC_JOURNAL_FIELDS) {
    if (!validField(spec, parsed[spec.name], regs)) return false;
  }
  return true;
}

function validField(spec: FieldSpec, value: unknown, regs: JournalRegistries): boolean {
  if (spec.guard === 'free') return true;
  const required = spec.presence === 'required';
  if (spec.guard === 'slug') {
    // The bash list read `. == null or (string and slug)`, so an absent key and
    // an explicit null both pass for a non-required field — but `false` does
    // not, because it is neither.
    if (!required && (value === undefined || value === null)) return true;
    return typeof value === 'string' && SLUG_RE.test(value);
  }
  // The enumerated and numeric optional fields went through jq's `//`, which
  // substitutes its default for null AND for false, so both reach the check as
  // the passing default.
  if (!required && jqAbsent(value)) return true;
  if (spec.guard === 'int') {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Math.floor(value) === value;
  }
  if (spec.guard === 'bool' || spec.json === 'boolean') return typeof value === 'boolean';
  const members = spec.values === undefined ? [] : spec.values(regs);
  return typeof value === 'string' && members.includes(value);
}

function jqAbsent(value: unknown): boolean {
  return value === undefined || value === null || value === false;
}
