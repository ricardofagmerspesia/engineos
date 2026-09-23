import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoot } from '../registry/paths';
import { EXEC_JOURNAL_FIELDS, SLUG_RE, journalRegistries, type FieldSpec } from './schema';

// The table itself is the assertion target. Every other function in src/journal/
// derives from it, so a row that drifts is a schema change, not a refactor.

const CHECKOUT = resolveRoot({}, __dirname);

// The order scripts/exec-journal.sh's jq object literal emitted, which IS the
// byte order of a journal line. Spelled out here — the one place in the tests
// that names fields — so a reordering of the table is a red test rather than a
// silent compatibility event for every consumer diffing journals.
const EMIT_ORDER = [
  'timestamp', 'run_id', 'capability_id', 'agent', 'model_tier', 'status',
  'tokens_in', 'tokens_out', 'duration_ms', 'note',
  'trace_id', 'span_id', 'parent_span_id', 'span_kind', 'tool', 'provider',
  'model', 'cost_micros', 'retry_attempt', 'cache_hit', 'route', 'risk',
];

test('the table carries 22 rows in the bash emit order', () => {
  assert.equal(EXEC_JOURNAL_FIELDS.length, 22);
  assert.deepEqual(EXEC_JOURNAL_FIELDS.map((spec) => spec.name), EMIT_ORDER);
});

test('every row has a distinct name and a distinct flag', () => {
  const names = new Set(EXEC_JOURNAL_FIELDS.map((spec) => spec.name));
  const flags = new Set(EXEC_JOURNAL_FIELDS.map((spec) => spec.flag));
  assert.equal(names.size, EXEC_JOURNAL_FIELDS.length);
  assert.equal(flags.size, EXEC_JOURNAL_FIELDS.length);
  for (const spec of EXEC_JOURNAL_FIELDS) assert.match(spec.flag, /^--[a-z-]+$/);
});

test('note is the only free-text row', () => {
  const free = EXEC_JOURNAL_FIELDS.filter((spec) => spec.guard === 'free');
  assert.deepEqual(free.map((spec) => spec.name), ['note']);
});

test('always is carried by agent, the two token counts and note alone', () => {
  const always = EXEC_JOURNAL_FIELDS.filter((spec) => spec.presence === 'always');
  assert.deepEqual(always.map((spec) => spec.name), ['agent', 'tokens_in', 'tokens_out', 'note']);
});

test('every enum row declares its members and no other row does', () => {
  for (const spec of EXEC_JOURNAL_FIELDS) {
    if (spec.guard === 'enum') assert.notEqual(spec.values, undefined, `${spec.name} enumerates nothing`);
    else assert.equal(spec.values, undefined, `${spec.name} is not an enum but declares members`);
  }
});

test('every enum row resolves to a non-empty member list from the live registries', () => {
  const regs = journalRegistries(CHECKOUT);
  for (const spec of enumRows()) {
    const members = spec.values === undefined ? [] : spec.values(regs);
    assert.ok(members.length > 0, `${spec.name} resolved to an empty vocabulary`);
    for (const member of members) assert.equal(typeof member, 'string');
  }
});

// The vocabularies are read live rather than restated, which is the whole point
// of retiring the constants — so the test asserts the SOURCE each row reads,
// not the values it happens to return today.
test('each enum row reads the registry that owns its vocabulary', () => {
  const regs = journalRegistries(CHECKOUT);
  const members = (name: string): readonly string[] => {
    const spec = EXEC_JOURNAL_FIELDS.find((row) => row.name === name);
    assert.notEqual(spec, undefined, `no row named ${name}`);
    return spec?.values === undefined ? [] : spec.values(regs);
  };
  assert.deepEqual(members('model_tier'), regs.models.tiers.map((tier) => tier.id));
  assert.deepEqual(members('status'), regs.execJournal.statuses);
  assert.deepEqual(members('span_kind'), regs.execJournal.span_kinds);
  assert.deepEqual(members('risk'), Object.keys(regs.policy.autonomy.ceiling_by_risk));
  // The boolean row's members are JSON's spellings, not a registry vocabulary.
  assert.deepEqual(members('cache_hit'), ['true', 'false']);
});

test('the JSON type of a row matches its guard class', () => {
  for (const spec of EXEC_JOURNAL_FIELDS) {
    if (spec.guard === 'int') assert.equal(spec.json, 'number', `${spec.name}`);
    if (spec.guard === 'slug' || spec.guard === 'free') assert.equal(spec.json, 'string', `${spec.name}`);
  }
});

test('the slug class admits the stamp this CLI writes and rejects whitespace', () => {
  assert.equal(SLUG_RE.source, '^[A-Za-z0-9@_./:-]+$');
  assert.ok(SLUG_RE.test('2026-09-04T12:00:00Z'));
  assert.ok(SLUG_RE.test('mcp.postgres'));
  assert.ok(!SLUG_RE.test('has space'));
  assert.ok(!SLUG_RE.test(''));
  // The `m`-flag trap: a trailing newline is exactly the whitespace the class
  // exists to refuse, and Oniguruma's `$` needed `\z` to say so.
  assert.ok(!SLUG_RE.test('ok\n'));
  assert.ok(!SLUG_RE.test('clean\nthen arbitrary text'));
  // `+` is outside the class, so an offset-carrying timestamp is a reject
  // (docs/COMPATIBILITY.md 1.6.0).
  assert.ok(!SLUG_RE.test('2026-09-03T12:00:00+00:00'));
});

function enumRows(): FieldSpec[] {
  return EXEC_JOURNAL_FIELDS.filter((spec) => spec.guard === 'enum');
}

test('tokens are always-present so an unobserved count emits null, not zero', () => {
  const tokensIn = EXEC_JOURNAL_FIELDS.find((spec) => spec.name === 'tokens_in');
  const tokensOut = EXEC_JOURNAL_FIELDS.find((spec) => spec.name === 'tokens_out');
  assert.equal(tokensIn?.presence, 'always');
  assert.equal(tokensOut?.presence, 'always');
});
