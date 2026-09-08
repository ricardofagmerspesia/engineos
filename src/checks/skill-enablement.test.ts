// C34 and C35: the skills/skills_suppressed pair at the three kernel answer
// sites, and a routing domain emptied by disablement.
//
// C34's negative case cannot be planted in a tree: the pair is produced by the
// kernel, and any mutation that removed it would be a source edit rather than a
// fixture. So the arm assertion is unit-tested as the pure function it is, and
// the checkout copy carries the one integration case.
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { isRecord } from '../lib/json';
import type { Finding } from './findings';
import type { CheckId } from './ids';
import { C34_FINDINGS, C35_FINDINGS, SKILL_ENABLEMENT_CHECKS, pairFindings } from './skill-enablement';
import { checkoutCopy, contextFor, editFile, findingsOf } from './testing';

const ROUTING_JSON = 'registries/routing.json';
const NESTJS_SKILL = 'skills/nestjs-patterns/SKILL.md';
const ADR_SKILL = 'skills/adr/SKILL.md';
const PAIR = { skills: [], skills_suppressed: [] };
const NO_PAIR = { skills: [] };
const produced = new Set<string>();

function run(root: string, id: CheckId): Finding[] {
  const found = findingsOf(SKILL_ENABLEMENT_CHECKS, id, contextFor(root));
  for (const one of found) produced.add(one.code);
  return found;
}

function record(found: readonly Finding[]): readonly Finding[] {
  for (const one of found) produced.add(one.code);
  return found;
}

// `enabled: false` inside the FIRST frontmatter block is the only spelling the
// kernel reads (src/kernel/skill-state.ts), so the line goes there.
function disable(root: string, skill: string): void {
  editFile(root, skill, (text) => {
    const lines = text.split('\n');
    lines.splice(1, 0, 'enabled: false');
    return lines.join('\n');
  });
}

function withoutSkills(root: string): void {
  editFile(root, ROUTING_JSON, (text) => {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed['domains'])) throw new Error('routing.json shape changed');
    for (const domain of parsed['domains']) {
      if (isRecord(domain)) domain['skills'] = [];
    }
    return `${JSON.stringify(parsed, null, 2)}\n`;
  });
}

// ------------------------------------------------------------------------ C34

test('C34 is clean on an unmutated checkout', (t: TestContext) => {
  assert.deepEqual(run(checkoutCopy(t), 'C34'), []);
});

test('C34 reports a pending artifact when no routing domain declares a skill', (t: TestContext) => {
  const root = checkoutCopy(t, withoutSkills);
  assert.deepEqual(run(root, 'C34'), [{ code: 'artifact-pending', subject: ROUTING_JSON }]);
});

test('a route-path answer without skills_suppressed is caught', () => {
  assert.deepEqual(record(pairFindings('route-path', NO_PAIR)), [
    { code: 'answer-lacks-suppressed-pair', subject: 'route-path' },
  ]);
});

test('a route-path answer carrying both keys is clean', () => {
  assert.deepEqual(pairFindings('route-path', PAIR), []);
});

test('a route-intent match without skills_suppressed is caught', () => {
  assert.deepEqual(pairFindings('route-intent', { matches: [PAIR, NO_PAIR] }), [
    { code: 'answer-lacks-suppressed-pair', subject: 'route-intent' },
  ]);
});

test('a route-intent answer with no matches at all is clean', () => {
  assert.deepEqual(pairFindings('route-intent', { matches: [] }), []);
});

test('a route-intent answer carrying no matches array is caught', () => {
  assert.deepEqual(pairFindings('route-intent', { error: 'unroutable' }), [
    { code: 'answer-lacks-suppressed-pair', subject: 'route-intent' },
  ]);
});

test('a resolve-task contract without skills_suppressed is caught', () => {
  assert.deepEqual(pairFindings('resolve-task', { task_contract: NO_PAIR }), [
    { code: 'answer-lacks-suppressed-pair', subject: 'resolve-task' },
  ]);
});

test('a resolve-task answer carrying the pair inside task_contract is clean', () => {
  assert.deepEqual(pairFindings('resolve-task', { task_contract: PAIR }), []);
});

test('an arm that answered nothing at all is caught', () => {
  assert.deepEqual(pairFindings('route-path', undefined), [
    { code: 'answer-lacks-suppressed-pair', subject: 'route-path' },
  ]);
});

// ------------------------------------------------------------------------ C35

test('C35 is clean on an unmutated checkout', (t: TestContext) => {
  assert.deepEqual(run(checkoutCopy(t), 'C35'), []);
});

test('disabling the only skill a routing domain declares is caught', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => disable(copy, NESTJS_SKILL));
  assert.deepEqual(run(root, 'C35'), [{ code: 'domain-emptied-by-disablement', subject: 'backend' }]);
});

test('disabling a skill no routing domain declares empties no domain', (t: TestContext) => {
  const root = checkoutCopy(t, (copy) => disable(copy, ADR_SKILL));
  assert.deepEqual(run(root, 'C35'), []);
});

// ------------------------------------------------------------------- coverage

test('every code these checks declare is produced by a case above', () => {
  const declared = [...C34_FINDINGS, ...C35_FINDINGS];
  assert.deepEqual(declared.filter((code) => !produced.has(code)), []);
});
