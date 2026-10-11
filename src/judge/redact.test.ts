import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPolicy } from '../registry/policy';
import { resolveRoot } from '../registry/paths';
import { cutAtCodeUnit, redactBounded, redactText, RedactionPatternError } from './redact';
import type { RedactionPattern } from './types';

// The shipped list is the only list the loader accepts (it is pinned by hash),
// so these cases exercise exactly what leaves the machine.
const patterns: readonly RedactionPattern[] = loadPolicy(resolveRoot({}, __dirname)).judge.redaction.patterns;

// Every credential-shaped sample is assembled at run time, so this file never
// carries a literal secret shape for the repository's own scanners to flag.
const DASHES = '-'.repeat(5);
const pemHeader = (label: string): string => `${DASHES}BEGIN ${label}PRIVATE` + ` KEY${DASHES}`;
const pemFooter = (label: string): string => `${DASHES}END ${label}PRIVATE` + ` KEY${DASHES}`;
const assign = (key: string, separator: string, value: string): string => key + separator + value;

const samples = {
  anthropic: (): string => 'sk-' + 'ant-' + 'api03-' + 'A'.repeat(24),
  openai: (): string => 'sk-' + 'proj-' + 'x'.repeat(24),
  skKey: (): string => 'sk-' + 'a1'.repeat(12),
  github: (): string => 'gh' + 'p_' + 'x'.repeat(36),
};

function placeholder(kind: string): string {
  return `<redacted:${kind}>`;
}

interface KindCase {
  kind: string;
  positive: () => string;
  // The fragment that must not survive redaction.
  secret: () => string;
  negative: () => string;
  // true when the negative must come back byte-identical, not merely free of
  // this kind's placeholder (another kind may legitimately claim part of it).
  negativeUnchanged: boolean;
}

const kindCases: KindCase[] = [
  {
    kind: 'private-key-block',
    positive: () => `${pemHeader('RSA ')}\nMIIBOgIBAAJBAKj34GkxFhD9\n0Zx+abc/def==\n${pemFooter('RSA ')}`,
    secret: () => 'MIIBOgIBAAJBAKj34GkxFhD9',
    negative: () => `${DASHES}BEGIN PUBLIC KEY${DASHES}\nMFkwEwYH\n${DASHES}END PUBLIC KEY${DASHES}`,
    negativeUnchanged: true,
  },
  {
    kind: 'private-key',
    positive: () => `key: ${pemHeader('EC ')}\nMHcCAQEEIBkg4LVWM9nuwNSk3yByxZpY\nRTBnYuZwC`,
    secret: () => 'MHcCAQEEIBkg4LVWM9nuwNSk3yByxZpY',
    negative: () => 'the PRIVATE KEY section of the runbook',
    negativeUnchanged: true,
  },
  {
    kind: 'private-key-id',
    positive: () => '{' + JSON.stringify('private_key' + '_id') + ': "' + 'a1b2c3d4'.repeat(5) + '", "type": "service_account"}',
    secret: () => 'a1b2c3d4'.repeat(5),
    negative: () => '{"key_id": "abc", "type": "service_account"}',
    negativeUnchanged: true,
  },
  {
    kind: 'jwt',
    positive: () => 'token eyJ' + 'hbGciOiJIUzI1NiJ9' + '.eyJ' + 'zdWIiOiIxMjM0NTY3ODkwIn0' + '.' + 'SflKxwRJSMeKKF2QT4fwpM end',
    secret: () => 'zdWIiOiIxMjM0NTY3ODkwIn0',
    negative: () => 'the eyJhbGci header alone',
    negativeUnchanged: true,
  },
  {
    kind: 'anthropic-key',
    positive: samples.anthropic,
    secret: () => 'A'.repeat(24),
    negative: () => 'sk-' + 'ant-short',
    negativeUnchanged: true,
  },
  {
    kind: 'openai-key',
    positive: samples.openai,
    secret: () => 'x'.repeat(24),
    negative: () => 'sk-' + 'proj-x',
    negativeUnchanged: true,
  },
  {
    kind: 'sk-key',
    positive: samples.skKey,
    secret: () => 'a1'.repeat(12),
    negative: () => 'pip install scikit sk-learn',
    negativeUnchanged: true,
  },
  {
    kind: 'stripe-key',
    positive: () => 's' + 'k_live_' + '0'.repeat(24) + ' r' + 'k_test_' + 'Z'.repeat(24),
    secret: () => '0'.repeat(24),
    negative: () => 'task_live_' + 'abcdefghijklmn',
    negativeUnchanged: true,
  },
  {
    kind: 'aws-key',
    positive: () => 'AK' + 'IA' + 'IOSFODNN7EXAMPLE',
    secret: () => 'IOSFODNN7EXAMPLE',
    negative: () => 'AK' + 'IA' + 'short',
    negativeUnchanged: true,
  },
  {
    kind: 'github-token',
    positive: () => samples.github() + ' gh' + 'o_' + 'y'.repeat(36),
    secret: () => 'x'.repeat(36),
    negative: () => 'gh' + 'x_' + 'x'.repeat(36),
    negativeUnchanged: true,
  },
  {
    kind: 'github-pat',
    positive: () => 'github' + '_pat_' + 'A1_'.repeat(10),
    secret: () => 'A1_'.repeat(10),
    negative: () => 'github' + '_pat_' + 'abc',
    negativeUnchanged: true,
  },
  {
    kind: 'gitlab-token',
    positive: () => 'gl' + 'pat-' + 'x'.repeat(20),
    secret: () => 'x'.repeat(20),
    negative: () => 'gl' + 'pat-' + 'short',
    negativeUnchanged: true,
  },
  {
    kind: 'npm-token',
    positive: () => 'np' + 'm_' + 'x'.repeat(36),
    secret: () => 'x'.repeat(36),
    negative: () => 'xnp' + 'm_' + 'x'.repeat(36),
    negativeUnchanged: true,
  },
  {
    kind: 'huggingface-token',
    positive: () => 'h' + 'f_' + 'x'.repeat(34),
    secret: () => 'x'.repeat(34),
    negative: () => 'sh' + 'f_' + 'x'.repeat(34),
    negativeUnchanged: true,
  },
  {
    kind: 'google-key',
    positive: () => 'AI' + 'za' + 'B'.repeat(35),
    secret: () => 'B'.repeat(35),
    negative: () => 'AI' + 'za' + 'B'.repeat(10),
    negativeUnchanged: true,
  },
  {
    kind: 'atlassian-token',
    positive: () => 'ATA' + 'TT' + 'x'.repeat(30),
    secret: () => 'x'.repeat(30),
    negative: () => 'ATA' + 'TT' + 'short',
    negativeUnchanged: true,
  },
  {
    kind: 'slack-token',
    positive: () => 'xo' + 'xb-' + '1234567890-abcdef',
    secret: () => '1234567890-abcdef',
    negative: () => 'xo' + 'xz-' + '1234567890-abcdef',
    negativeUnchanged: true,
  },
  {
    kind: 'url-credentials',
    // The password holds an at sign; the whole userinfo must go, not the part
    // before the first one.
    positive: () => 'postgres' + '://admin:' + 'p@ss' + 'word' + '@' + 'db.example.com/app',
    secret: () => 'ss' + 'word',
    negative: () => 'see https://example.com/path for details',
    negativeUnchanged: true,
  },
  {
    kind: 'basic-auth',
    positive: () => 'Authorization: Basic ' + 'dXNlcjpwYXNz',
    secret: () => 'dXNlcjpwYXNz',
    negative: () => 'what is the basic usage of this flag',
    negativeUnchanged: true,
  },
  {
    kind: 'bearer-token',
    positive: () => 'Authorization: Bearer ' + 'abcDEF123'.repeat(3),
    secret: () => 'abcDEF123'.repeat(3),
    negative: () => 'the bearer of bad news',
    negativeUnchanged: true,
  },
  {
    kind: 'aws-secret',
    positive: () => assign('aws_secret_access_key', ' = ', 'wJalrXUtnFEMI/K7MDENG/' + 'bPxRfiCYEXAMPLEKEY'),
    secret: () => 'bPxRfiCYEXAMPLEKEY',
    negative: () => assign('secret_key', ': ', 'A'.repeat(39)),
    negativeUnchanged: true,
  },
  {
    kind: 'secret-assignment',
    positive: () => assign('password', '=', 'hunter' + '22'),
    secret: () => 'hunter' + '22',
    negative: () => 'reset the password flow; ' + assign('token', ': ', 'abc'),
    negativeUnchanged: true,
  },
  {
    kind: 'email',
    positive: () => 'mail jane.doe' + '@' + 'example.com now',
    secret: () => 'jane.doe',
    negative: () => '@Injectable() decorator and user' + '@' + 'localhost',
    negativeUnchanged: true,
  },
  {
    kind: 'phone',
    positive: () => 'call +1 415 555 0132 or +55' + '11987654321',
    secret: () => '415 555 0132',
    negative: () => 'version +12 and C++ 1+1',
    negativeUnchanged: true,
  },
  {
    kind: 'cnpj',
    positive: () => 'CNPJ 12.345.678' + '/0001-95',
    secret: () => '345.678',
    negative: () => 'build 12.345.678 of the app',
    negativeUnchanged: true,
  },
  {
    kind: 'cpf',
    positive: () => 'CPF 123.456' + '.789-09',
    secret: () => '456.789',
    negative: () => 'id 1234567890',
    negativeUnchanged: true,
  },
  {
    kind: 'phone-br',
    positive: () => 'tel (11) 98765' + '-4321 or 11 98765' + '-4321',
    secret: () => '98765',
    negative: () => 'release 2026-10-11 at 1700000000',
    negativeUnchanged: true,
  },
];

test('the case table covers every shipped redaction kind exactly once', () => {
  assert.deepEqual(
    kindCases.map((entry) => entry.kind).sort(),
    patterns.map((pattern) => pattern.kind).sort(),
  );
  assert.equal(patterns.length, 27);
});

for (const entry of kindCases) {
  test(`redacts a ${entry.kind} sample and drops its secret part`, () => {
    const redacted = redactText(entry.positive(), patterns);

    assert.ok(redacted.includes(placeholder(entry.kind)), `${entry.kind}: ${redacted}`);
    assert.ok(!redacted.includes(entry.secret()), `${entry.kind} leaked: ${redacted}`);
  });

  test(`leaves a ${entry.kind} look-alike readable`, () => {
    const text = entry.negative();

    const redacted = redactText(text, patterns);

    assert.ok(!redacted.includes(placeholder(entry.kind)), `${entry.kind}: ${redacted}`);
    if (entry.negativeUnchanged) assert.equal(redacted, text);
  });
}

test('a JSON-escaped PEM block is redacted end to end as one block', () => {
  const body = 'MIIEvQIBADANBg\\nkqhkiG9w0BAQ==';
  const escaped = `{"k":"${pemHeader('')}\\n${body}\\n${pemFooter('')}\\n"}`;

  const redacted = redactText(escaped, patterns);

  assert.equal(redacted, `{"k":"${placeholder('private-key-block')}\\n"}`);
});

test('an encrypted PEM with Proc-Type and DEK-Info headers leaves nothing of the key behind', () => {
  const pem = [
    pemHeader('RSA '),
    'Proc-Type: 4,ENCRYPTED',
    'DEK-Info: AES-128-CBC,3F17F5316E2BAC89',
    '',
    'hwFoo+Bar/baz==',
    pemFooter('RSA '),
  ].join('\n');

  const redacted = redactText(pem, patterns);

  assert.equal(redacted, placeholder('private-key'));
});

test('an unterminated PEM header still hides the body that follows it', () => {
  const redacted = redactText(`${pemHeader('')}\nMIIEvQIBADANBgkqhkiG9w0BAQ`, patterns);

  assert.equal(redacted, placeholder('private-key'));
});

test('a quoted multi-word secret is redacted whole, in double, single and JSON quoting', () => {
  const phrase = 'correct horse battery staple';
  const cases = [
    assign('password', ': ', `"${phrase}"`),
    assign('secret', ' = ', `'${phrase}'`),
    JSON.stringify({ ['pass' + 'word']: phrase }),
  ];

  for (const text of cases) {
    const redacted = redactText(text, patterns);

    assert.ok(redacted.includes(placeholder('secret-assignment')), redacted);
    assert.ok(!redacted.includes('horse'), redacted);
    assert.ok(!redacted.includes('staple'), redacted);
  }
});

test('the url-credentials match keeps the host after the last at sign readable', () => {
  const redacted = redactText('postgres' + '://admin:' + 'p@ss' + 'word' + '@' + 'db.example.com/app', patterns);

  assert.equal(redacted, `${placeholder('url-credentials')}db.example.com/app`);
});

test('an earlier, more specific kind wins over a later, broader one', () => {
  assert.equal(redactText(samples.anthropic(), patterns), placeholder('anthropic-key'));
  assert.equal(redactText(samples.openai(), patterns), placeholder('openai-key'));
});

test('a value already replaced by a placeholder is never re-redacted by an assignment pattern', () => {
  const redacted = redactText(assign('token', ': ', samples.anthropic()), patterns);

  assert.equal(redacted, `token: ${placeholder('anthropic-key')}`);
});

test('every placeholder survives a second redaction pass unchanged', () => {
  for (const { kind } of patterns) {
    assert.equal(redactText(placeholder(kind), patterns), placeholder(kind));
  }
  for (const entry of kindCases) {
    const once = redactText(entry.positive(), patterns);
    assert.equal(redactText(once, patterns), once, entry.kind);
  }
});

test('unix timestamps, ISO dates and ordinary prose stay readable', () => {
  const text = 'deployed at 1700000000 (1760000000000 ms) on 2026-10-11T10:00:00Z; see the basic usage guide';

  assert.equal(redactText(text, patterns), text);
});

test('an empty pattern list returns the text untouched', () => {
  assert.equal(redactText(samples.github(), []), samples.github());
});

test('a pattern that does not compile throws RedactionPatternError naming only the kind', () => {
  const broken: RedactionPattern[] = [{ kind: 'broken-kind', pattern: '(' }];

  assert.throws(
    () => redactText('anything', broken),
    (error: unknown) => {
      assert.ok(error instanceof RedactionPatternError);
      assert.equal(error.kind, 'judge-redaction-pattern');
      assert.ok(error.message.includes('broken-kind'));
      assert.ok(!error.message.includes('('));
      return true;
    },
  );
});

// Linearity floor: every shipped pattern over 32,768 adversarial characters.
// The bound is generous on purpose (the measured cost is a few milliseconds);
// a backtracking pattern would take seconds, which is what this catches.
test('redaction of 32,768-character adversarial inputs stays well inside a time bound', () => {
  const size = 32_768;
  const fill = (unit: string): string => unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
  const inputs = [
    fill(pemHeader('') + 'A'.repeat(40)),
    pemHeader('') + fill('A'),
    fill(JSON.stringify('private_key' + '_id') + ': "'),
    fill('eyJ'),
    'eyJ' + fill('a'),
    fill('sk-' + 'ant-'),
    fill('sk-' + 'a'.repeat(19) + ' '),
    fill('s' + 'k_live_'),
    fill('AK' + 'IA'),
    fill('gh' + 'p_'),
    fill('a:/' + '/b:'),
    'ab:/' + '/x:' + fill('c'),
    fill('Basic '),
    fill('Bearer '),
    fill('aws_secret_access_key='),
    fill('password'),
    fill('password="'),
    fill('a'),
    fill('a' + '@' + 'b.'),
    'a' + '@' + fill('b'),
    fill('+1 2 3 4 5 6 '),
    fill('1'),
    fill('12.345.678/'),
    fill('(11) 9'),
    fill(' '),
  ];
  const started = process.hrtime.bigint();

  for (const input of inputs) redactText(input, patterns);

  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(elapsedMs < 2_000, `adversarial redaction took ${elapsedMs.toFixed(1)} ms`);
});

test('redactBounded redacts the whole text when it fits under the pre-cap', () => {
  const text = `hello ${samples.github()} world`;

  const bounded = redactBounded(text, patterns, 1_000);

  assert.deepEqual(bounded, { text: `hello ${placeholder('github-token')} world`, capped: false });
});

test('redactBounded flags a capped prompt and never scans past the pre-cap', () => {
  const head = 'route this request ';
  const text = head + samples.github() + ' and more';

  const bounded = redactBounded(text, patterns, head.length);

  assert.equal(bounded.capped, true);
  assert.equal(bounded.text, head);
});

test('redactBounded drops a trailing fragment that a pattern could only match whole', () => {
  // The cut lands inside the token: 10 of its 40 characters fit, too few for
  // the github-token minimum, so the fragment itself must not be sent.
  const head = 'paste: ';
  const text = head + samples.github();

  const bounded = redactBounded(text, patterns, head.length + 10);

  assert.equal(bounded.capped, true);
  assert.equal(bounded.text, head);
  assert.ok(!bounded.text.includes('gh' + 'p_'));
});

test('redactBounded returns empty text when the capped prefix is one unbroken fragment', () => {
  const bounded = redactBounded('x'.repeat(50), patterns, 20);

  assert.deepEqual(bounded, { text: '', capped: true });
});

test('redactBounded never leaves half of a surrogate pair at the cut', () => {
  const text = 'a b ' + '\u{1F600}'.repeat(4) + ' tail';
  const loneHigh = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/;

  for (let cap = 1; cap < text.length; cap += 1) {
    const bounded = redactBounded(text, patterns, cap);
    assert.ok(!loneHigh.test(bounded.text), `cap ${cap}: ${JSON.stringify(bounded.text)}`);
  }
});

test('cutAtCodeUnit keeps short text, cuts long text and backs off a high surrogate', () => {
  assert.equal(cutAtCodeUnit('abc', 5), 'abc');
  assert.equal(cutAtCodeUnit('abcdef', 3), 'abc');
  assert.equal(cutAtCodeUnit('ab\u{1F600}', 3), 'ab');
  assert.equal(cutAtCodeUnit('ab\u{1F600}', 4), 'ab\u{1F600}');
  assert.equal(cutAtCodeUnit('\u{1F600}', 1), '');
});
