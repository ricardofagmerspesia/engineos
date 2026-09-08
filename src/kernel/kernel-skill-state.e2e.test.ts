import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord, readJsonFile } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { relocatedRoot, runCli, tempRoot, type RunResult } from '../testing/harness';

// Black-box port of scripts/test-kernel.sh (the skill-enablement block).
//
// The disable switch had no reader outside the console: a skill turned off in
// the UI was still handed to the model by every routing answer. These cases are
// the proof that it now has one, and the regression that keeps it having one.
//
// The domain, the skill and the sample path all come from registries/routing.json
// so a re-parameterised registry MOVES the fixture instead of turning it red —
// and so the route-path case is never vacuous, which it would be against a
// domain that declares no skills.

const ROOT = resolveRoot({}, __dirname);

function kernel(args: string[], env: Record<string, string> = {}): RunResult {
  return runCli(['kernel', ...args], { env });
}

function body(result: RunResult): Record<string, unknown> {
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isRecord(parsed)) throw new Error(`the kernel answered non-object JSON: ${result.stdout}`);
  return parsed;
}

function okBody(result: RunResult): Record<string, unknown> {
  assert.equal(result.status, 0, `expected rc=0, got rc=${result.status}: ${result.stdout}${result.stderr}`);
  return body(result);
}

function errorMessage(result: RunResult): string {
  assert.notEqual(result.status, 0, `expected a non-zero exit: ${result.stdout}`);
  const message = body(result)['error'];
  assert.equal(typeof message, 'string', `expected an .error body, got ${result.stdout}`);
  return String(message);
}

function record(value: unknown, at: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${at} is not a JSON object`);
  return value;
}

function rows(value: unknown, at: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${at} is not an array`);
  return value.map((item, i) => record(item, `${at}[${String(i)}]`));
}

const ROUTING = record(readJsonFile(join(ROOT, 'registries', 'routing.json')), 'registries/routing.json');

interface SkillFixture {
  domain: string;
  skill: string;
  samplePath: string;
}

// The first routing domain that declares at least one skill, exactly as the bash
// block picked it. A registry where no domain declares a skill cannot express
// this test, and saying so beats asserting nothing.
function skillFixture(): SkillFixture {
  for (const [i, row] of rows(ROUTING['domains'], 'registries/routing.json .domains').entries()) {
    const id = row['id'];
    const skills = row['skills'];
    const samplePath = row['sample_path'];
    if (typeof id !== 'string' || !Array.isArray(skills) || skills.length === 0) continue;
    const skill = skills[0];
    if (typeof skill !== 'string' || typeof samplePath !== 'string') {
      throw new Error(`registries/routing.json .domains[${String(i)}] has no usable skill/sample_path pair`);
    }
    return { domain: id, skill, samplePath };
  }
  throw new Error('no routing domain declares a skill — the fixture cannot be built');
}

const FIXTURE = skillFixture();

// Every SKILL.md the checkout carries, counted the way the bash block counted it
// (`find skills -mindepth 2 -maxdepth 2 -name SKILL.md`).
function skillDirsInCheckout(): string[] {
  const dir = join(ROOT, 'skills');
  return readdirSync(dir).filter((id) => {
    if (id.startsWith('.')) return false;
    try {
      return statSync(join(dir, id)).isDirectory() && statSync(join(dir, id, 'SKILL.md')).isFile();
    } catch {
      return false;
    }
  });
}

// A relocated root with one planted skill. relocatedRoot copies registries/ and
// nothing else, so the tree carries EXACTLY the skill this case is about — which
// is what makes `disabled` and `skills_suppressed` readable without subtracting
// the checkout's own skills.
function plantedRoot(t: TestContext, skillMd: string): string {
  const root = relocatedRoot(tempRoot(t));
  mkdirSync(join(root, 'skills', FIXTURE.skill), { recursive: true });
  writeFileSync(join(root, 'skills', FIXTURE.skill, 'SKILL.md'), skillMd);
  return root;
}

const DISABLED_MD = `---\nname: ${FIXTURE.skill}\nenabled: false\n---\n\nbody\n`;
const ENABLED_MD = `---\nname: ${FIXTURE.skill}\n---\n\nbody\n`;
// An `enabled:` line in the BODY is documentation, not configuration: a parser
// that scanned the whole file would let a code sample switch a skill off.
const BODY_MENTION_MD = `---\nname: ${FIXTURE.skill}\n---\n\nExample frontmatter:\n\nenabled: false\n`;
const NO_FRONTMATTER_MD = `# ${FIXTURE.skill}\n\nenabled: false\n`;

// ----------------------------------------------------------------- skill-state

test('skill-state answers without arguments', () => {
  const answer = okBody(kernel(['skill-state']));
  assert.ok(Array.isArray(answer['skills']), 'skills must be an array');
  assert.ok(Array.isArray(answer['disabled']), 'disabled must be an array');
});

test('every skill under skills/ is listed', () => {
  const answer = okBody(kernel(['skill-state']));
  assert.equal(rows(answer['skills'], '.skills').length, skillDirsInCheckout().length);
});

test('the list is sorted by id and each row carries id + enabled', () => {
  const listed = rows(okBody(kernel(['skill-state']))['skills'], '.skills');
  const ids = listed.map((row) => String(row['id']));
  assert.deepEqual(ids, [...ids].sort());
  for (const row of listed) assert.deepEqual(Object.keys(row), ['id', 'enabled']);
});

test('a skill that exists reports exists:true', () => {
  const [first] = skillDirsInCheckout().sort();
  if (first === undefined) throw new Error('the checkout carries no skills');
  const answer = okBody(kernel(['skill-state', '--id', first]));
  assert.deepEqual(Object.keys(answer), ['id', 'exists', 'enabled']);
  assert.equal(answer['id'], first);
  assert.equal(answer['exists'], true);
});

test('an unknown id reports exists:false and is not reported as disabled', () => {
  const answer = okBody(kernel(['skill-state', '--id', 'no-such-skill-anywhere']));
  assert.equal(answer['exists'], false);
  // Absent is not "turned off": a routing row may name a skill this installation
  // does not ship, and reporting that as disabled would invent a decision.
  assert.equal(answer['enabled'], true);
});

test('an unknown argument is refused with the legacy wording', () => {
  assert.equal(errorMessage(kernel(['skill-state', '--bogus', 'x'])), 'skill-state: unknown argument --bogus');
});

test('an explicitly empty --id selects the list form, as `[ -n "$id" ]` did', () => {
  const answer = okBody(kernel(['skill-state', '--id', '']));
  assert.ok(Array.isArray(answer['skills']), 'an empty --id must answer the list form');
});

// ------------------------------------------------------- frontmatter semantics

test('frontmatter enabled:false is read as disabled', (t: TestContext) => {
  const root = plantedRoot(t, DISABLED_MD);
  const answer = okBody(kernel(['skill-state', '--id', FIXTURE.skill], { ENGINEOS_ROOT: root }));
  assert.equal(answer['exists'], true);
  assert.equal(answer['enabled'], false);
  assert.deepEqual(okBody(kernel(['skill-state'], { ENGINEOS_ROOT: root }))['disabled'], [FIXTURE.skill]);
});

test('absence of the enabled key means enabled', (t: TestContext) => {
  const root = plantedRoot(t, ENABLED_MD);
  assert.equal(okBody(kernel(['skill-state', '--id', FIXTURE.skill], { ENGINEOS_ROOT: root }))['enabled'], true);
  assert.deepEqual(okBody(kernel(['skill-state'], { ENGINEOS_ROOT: root }))['disabled'], []);
});

test('an enabled: line in the body does not disable the skill', (t: TestContext) => {
  const root = plantedRoot(t, BODY_MENTION_MD);
  assert.equal(okBody(kernel(['skill-state', '--id', FIXTURE.skill], { ENGINEOS_ROOT: root }))['enabled'], true);
});

test('a SKILL.md without frontmatter stays enabled', (t: TestContext) => {
  const root = plantedRoot(t, NO_FRONTMATTER_MD);
  assert.equal(okBody(kernel(['skill-state', '--id', FIXTURE.skill], { ENGINEOS_ROOT: root }))['enabled'], true);
});

test('a root with no skills/ directory answers an empty state, not an error', (t: TestContext) => {
  // relocatedRoot copies registries/ only, which is the shape a consumer project
  // routing against EngineOS registries without its skills tree really has.
  const root = relocatedRoot(tempRoot(t));
  const answer = okBody(kernel(['skill-state'], { ENGINEOS_ROOT: root }));
  assert.deepEqual(answer, { skills: [], disabled: [] });
});

// ----------------------------------------------------- suppression in routing

test('route-path drops a disabled skill and says why', (t: TestContext) => {
  const root = plantedRoot(t, DISABLED_MD);
  const answer = okBody(kernel(['route-path', FIXTURE.samplePath], { ENGINEOS_ROOT: root }));
  assert.equal(answer['domain'], FIXTURE.domain);
  assert.ok(
    !stringList(answer['skills'], '.skills').includes(FIXTURE.skill),
    'the disabled skill must not be recommended',
  );
  // A short list and a filtered list are indistinguishable to an operator unless
  // the reason travels with them, which is the whole point of the second key.
  assert.deepEqual(rows(answer['skills_suppressed'], '.skills_suppressed')[0], {
    id: FIXTURE.skill,
    reason: 'disabled',
  });
});

test('route-path emits skills_suppressed in the legacy key position', (t: TestContext) => {
  const root = plantedRoot(t, DISABLED_MD);
  const answer = okBody(kernel(['route-path', FIXTURE.samplePath], { ENGINEOS_ROOT: root }));
  assert.deepEqual(Object.keys(answer), [
    'domain', 'rules', 'skills', 'skills_suppressed', 'agent', 'risk_floor', 'hook_guidance', 'excluded',
  ]);
});

test('re-enabling by removing the key restores the skill and empties skills_suppressed', (t: TestContext) => {
  const root = plantedRoot(t, ENABLED_MD);
  const answer = okBody(kernel(['route-path', FIXTURE.samplePath], { ENGINEOS_ROOT: root }));
  assert.ok(stringList(answer['skills'], '.skills').includes(FIXTURE.skill));
  // Always present, empty when nothing was withheld: a caller must never have to
  // tell "no suppression" apart from "this answer does not report suppression".
  assert.deepEqual(answer['skills_suppressed'], []);
});

test('route-intent and resolve-task suppress the same skill at their own sites', (t: TestContext) => {
  const root = plantedRoot(t, DISABLED_MD);
  const prompt = promptMatchingSkill(FIXTURE.skill);

  for (const match of rows(okBody(kernel(['route-intent', prompt], { ENGINEOS_ROOT: root }))['matches'], '.matches')) {
    assert.deepEqual(Object.keys(match), [
      'id', 'title', 'rules', 'skills', 'skills_suppressed', 'agents', 'commands', 'mcp',
      'model_tier', 'risk_floor', 'note',
    ]);
    assert.ok(!stringList(match['skills'], '.skills').includes(FIXTURE.skill));
  }

  const contract = record(
    okBody(kernel(['resolve-task', '--prompt', prompt], { ENGINEOS_ROOT: root }))['task_contract'],
    '.task_contract',
  );
  assert.ok(!stringList(contract['skills'], '.task_contract.skills').includes(FIXTURE.skill));
  assert.ok(
    rows(contract['skills_suppressed'], '.task_contract.skills_suppressed').some(
      (row) => row['id'] === FIXTURE.skill && row['reason'] === 'disabled',
    ),
    'the task contract must name the skill it withheld',
  );
});

test('the task contract carries skills_suppressed in the legacy key position', () => {
  const contract = record(
    okBody(kernel(['resolve-task', '--prompt', promptMatchingSkill(FIXTURE.skill)]))['task_contract'],
    '.task_contract',
  );
  assert.deepEqual(Object.keys(contract), [
    'substantive', 'intents', 'escalates', 'escalation_reasons', 'suppressed', 'agents', 'rules',
    'policy_rules', 'skills', 'skills_suppressed', 'commands', 'mcp', 'model_tier', 'risk_floor',
    'autonomy_ceiling_at_floor', 'scale', 'decision_rules', 'required', 'gates', 'preferences',
  ]);
});

// ------------------------------------------------------------------ internals

function stringList(value: unknown, at: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${at} is not an array`);
  return value.map((item) => {
    if (typeof item !== 'string') throw new Error(`${at} holds a non-string`);
    return item;
  });
}

// A prompt that routes to an intent declaring this skill, taken from that
// intent's own first signal — so the prompt cannot drift away from the registry
// the way a hand-written one would.
function promptMatchingSkill(skill: string): string {
  const intents = record(readJsonFile(join(ROOT, 'registries', 'intents.json')), 'registries/intents.json');
  for (const row of rows(intents['intents'], 'registries/intents.json .intents')) {
    const skills = row['skills'];
    if (!Array.isArray(skills) || !skills.includes(skill)) continue;
    const signals = row['signals'];
    if (!Array.isArray(signals)) continue;
    const [signal] = signals;
    if (typeof signal === 'string' && signal !== '') return signal;
  }
  throw new Error(`no intent declares the skill ${skill} with a usable signal`);
}
