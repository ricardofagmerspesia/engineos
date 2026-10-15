import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPolicy } from '../registry/policy';
import { resolveRoot } from '../registry/paths';
import { redactText } from './redact';
import { buildJudgeState } from './state';
import type { JudgeInput, JudgePolicy, JudgeState } from './types';

const shippedPolicy: JudgePolicy = loadPolicy(resolveRoot({}, __dirname)).judge;
const githubToken = (): string => 'gh' + 'p_' + 'x'.repeat(36);
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function input(text: string, overrides: Partial<JudgeInput> = {}): JudgeInput {
  return {
    text,
    source: 'user',
    repository: { declared_stack: ['typescript', 'nextjs'], active_spec: true, open_change_record: false },
    session: { last_intent: 'frontend' },
    ...overrides,
  };
}

function policyWith(maxStateBytes: number): JudgePolicy {
  return { ...shippedPolicy, max_state_bytes: maxStateBytes };
}

function bytesOf(state: JudgeState): number {
  return Buffer.byteLength(JSON.stringify(state), 'utf8');
}

function okState(result: ReturnType<typeof buildJudgeState>): JudgeState {
  if (result.kind !== 'ok') throw new Error(`expected an ok state, got ${result.kind}`);
  return result.state;
}

test('a prompt that fits is sent whole, redacted, with no truncated flag', () => {
  const state = okState(buildJudgeState(input(`ship it with ${githubToken()}`), shippedPolicy));

  assert.deepEqual(state, {
    request: { text: 'ship it with <redacted:github-token>', source: 'user' },
    repository: { declared_stack: ['typescript', 'nextjs'], active_spec: true, open_change_record: false },
    session: { last_intent: 'frontend' },
  });
});

test('the state holds only request, repository and session, and copies the stack list', () => {
  const declared = ['typescript'];
  const state = okState(buildJudgeState(input('hello', { repository: { declared_stack: declared, active_spec: false, open_change_record: true } }), shippedPolicy));

  declared.push('mutated-after-build');

  assert.deepEqual(Object.keys(state), ['request', 'repository', 'session']);
  assert.deepEqual(state.repository.declared_stack, ['typescript']);
});

test('a prompt over the cap is truncated to the longest prefix whose serialized state fits', () => {
  const max = 400;
  const text = 'word '.repeat(150);

  const state = okState(buildJudgeState(input(text), policyWith(max)));

  assert.equal(state.request.truncated, true);
  assert.ok(bytesOf(state) <= max, `${bytesOf(state)} > ${max}`);
  assert.ok(text.startsWith(state.request.text));
  const longer: JudgeState = { ...state, request: { ...state.request, text: text.slice(0, state.request.text.length + 1) } };
  assert.ok(bytesOf(longer) > max, 'one more character would still have fit');
});

test('truncation never splits a multi-byte character or a surrogate pair', () => {
  // 500 UTF-16 units: under every pre-cap below, so only the byte fit cuts it.
  const text = 'é\u{1F600}漢 '.repeat(100);

  for (const max of [300, 301, 302, 303, 333]) {
    const state = okState(buildJudgeState(input(text), policyWith(max)));
    assert.equal(state.request.truncated, true, `max ${max}`);
    assert.ok(state.request.text.length > 0, `max ${max}`);
    assert.ok(bytesOf(state) <= max, `max ${max}`);
    assert.ok(!LONE_SURROGATE.test(state.request.text), `max ${max}`);
    assert.ok(text.startsWith(state.request.text), `max ${max}`);
  }
});

test('truncation cuts the already-redacted text, so a cut can never expose part of a secret', () => {
  const head = 'deploy now ';
  const text = head + githubToken() + ' ' + 'tail '.repeat(100);
  const fixed = bytesOf({
    request: { text: '', source: 'user', truncated: true },
    repository: input('').repository,
    session: input('').session,
  });

  // Room for the head plus a few characters: a raw cut would land in the token.
  const state = okState(buildJudgeState(input(text), policyWith(fixed + head.length + 8)));

  assert.equal(state.request.truncated, true);
  assert.ok(!state.request.text.includes('gh' + 'p_'), state.request.text);
  assert.ok(!state.request.text.includes('xxxxxxxx'), state.request.text);
});

test('a prompt longer than twice the cap is pre-capped and still reported truncated', () => {
  const max = 300;
  const state = okState(buildJudgeState(input('a '.repeat(2_000)), policyWith(max)));

  assert.equal(state.request.truncated, true);
  assert.ok(bytesOf(state) <= max);
});

// The critic's construction (W2), through the shipped policy: three PEM blocks
// redact to a few dozen characters each, so the state has room to spare, while
// a quoted secret holding spaces straddles the 2 x max_state_bytes pre-cap.
const DASHES = '-'.repeat(5);
const pemBlock = (): string =>
  `${DASHES}BEGIN RSA PRIVATE` + ` KEY${DASHES}\n` + ('A'.repeat(64) + '\n').repeat(120) + `${DASHES}END RSA PRIVATE` + ` KEY${DASHES}\n`;
const PHRASE_WORDS = ['correct', 'horse', 'battery', 'staple', 'zebra'];

function quotedSecrets(): string[] {
  const phrase = PHRASE_WORDS.join(' ');
  return ['pass' + 'word' + ': ' + `"${phrase}"`, 'sec' + 'ret' + ' = ' + `'${phrase}'`, JSON.stringify({ ['pass' + 'word']: phrase })];
}

test('a quoted secret straddling the pre-cap after heavy upstream shrinkage never reaches the state', () => {
  const preCap = 2 * shippedPolicy.max_state_bytes;
  const head = pemBlock().repeat(3);

  for (const secret of quotedSecrets()) {
    for (let inside = 1; inside < secret.length; inside += 1) {
      const room = preCap - head.length - inside;
      const text = head + (room % 2 === 1 ? ' ' : '') + 'x '.repeat(Math.floor(room / 2)) + secret + ' and more after the cap';

      const state = okState(buildJudgeState(input(text), shippedPolicy));

      assert.equal(state.request.truncated, true);
      assert.ok(bytesOf(state) <= shippedPolicy.max_state_bytes);
      const leaked = PHRASE_WORDS.filter((word) => state.request.text.includes(word));
      assert.deepEqual(leaked, [], `cut ${inside} into ${secret.slice(0, 8)}: ${JSON.stringify(state.request.text.slice(-60))}`);
      assert.ok(redactText(text, shippedPolicy.redaction.patterns).startsWith(state.request.text), `cut ${inside}`);
    }
  }
});

test('repository facts that alone exceed the cap make the state oversize', () => {
  const crowded = input('hi', {
    repository: { declared_stack: Array.from({ length: 50 }, (_, i) => `framework-${i}`), active_spec: false, open_change_record: false },
  });

  assert.deepEqual(buildJudgeState(crowded, policyWith(256)), { kind: 'oversize' });
});
