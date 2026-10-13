import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { fixtureRepo, tempRoot } from '../testing/harness';
import { readEnvelope, type HookEnvelope } from './envelope';
import { silent, type HookContext } from './output';
import { run } from './prompt-advisor';

const checkout = resolveRoot({}, __dirname);

// The operator's machine-wide bypass must never decide a case (the bash suite
// exports the same isolation before it runs).
const ISOLATED: NodeJS.ProcessEnv = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

// The bypass announcement, restated rather than imported: it is the one thing a
// bypassed session is told, and a test that imported the constant would pass
// however the constant was rewritten.
const BYPASS_NOTICE =
  '[engineos] BYPASS ACTIVE — routing, rules, agent dispatch, spec gate, change records, and the Stop gates are OFF for this session. Answer directly, with no [router] line and no agent banners. Do not offer the output artifact. The harness\'s own safety rules still apply: no secrets in code or commits, and confirm destructive or outward-facing actions. Run `/engineos:bypass off` to restore EngineOS.';

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

function hookCtx(env: NodeJS.ProcessEnv = ISOLATED): HookContext {
  return { io: memoryIo({ env }), root: checkout, now: () => 1000, spawn: spawnSync };
}

// The harness envelope() carries no prompt, so a UserPromptSubmit payload is
// built here — through readEnvelope, so the decode under test is the real one.
function promptOf(prompt: string, cwd: string = '', sid: string = 'test'): HookEnvelope {
  const decoded = readEnvelope(memoryIo({ stdin: JSON.stringify({ prompt, cwd, session_id: sid }) }));
  assert.notEqual(decoded, null);
  if (decoded === null) throw new Error('unreachable');
  return decoded;
}

async function guidance(prompt: string): Promise<string> {
  const decision = await run(promptOf(prompt), hookCtx());
  assert.equal(decision.kind, 'context');
  if (decision.kind !== 'context') throw new Error('unreachable');
  assert.equal(decision.event, 'UserPromptSubmit');
  return decision.text;
}

// The lenient form, for the cases that assert a phrase is ABSENT: silence is a
// legitimate way to not say something, so those must not also require a payload.
async function advice(prompt: string): Promise<string> {
  const decision = await run(promptOf(prompt), hookCtx());
  return decision.kind === 'context' ? decision.text : '';
}

function lines(text: string): string[] {
  return text.split('\n').filter((line) => line.startsWith('[engineos]'));
}

// noUncheckedIndexedAccess makes every [0] optional; a missing first row is a
// failed test, not a value to narrow around at each call site.
function first(rows: Record<string, unknown>[]): Record<string, unknown> {
  const row = rows[0];
  if (row === undefined) throw new Error('no rows were written');
  return row;
}

function jsonLines(file: string): Record<string, unknown>[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) throw new Error(`not a JSON object: ${line}`);
      return parsed;
    });
}

// ------------------------------------------------------------------- silence

test('a bypassed session is told so, and nothing else happens', async () => {
  const env: NodeJS.ProcessEnv = { ...ISOLATED, ENGINEOS_BYPASS: '1' };
  assert.deepEqual(await run(promptOf('deploy to production'), hookCtx(env)), {
    kind: 'context',
    event: 'UserPromptSubmit',
    text: BYPASS_NOTICE,
  });
});

test('an empty prompt resolves nothing and stays silent', async () => {
  assert.deepEqual(await run(promptOf(''), hookCtx()), silent);
});

test('a subagent hand-back is not a request and stays silent', async () => {
  const handback = 'Another Claude session sent a message:\n<agent-message from="a1">\n[Subagent hand-back] add an endpoint that lists invoices — done\n</agent-message>';
  assert.deepEqual(await run(promptOf(handback), hookCtx()), silent);
});

test('a task notification wrapped in a system reminder stays silent', async () => {
  const notice = '<system-reminder>\n[SYSTEM NOTIFICATION - NOT USER INPUT]\n<task-notification><task-id>x</task-id><summary>Agent finished: add an endpoint</summary></task-notification>\n</system-reminder>';
  assert.deepEqual(await run(promptOf(notice), hookCtx()), silent);
});

test('a prompt behind a leading reminder block is routed by its human part only', async () => {
  const mixed = '<system-reminder>\nfiles were re-read\n</system-reminder>\nadd a NestJS endpoint that lists invoices';
  const decision = await run(promptOf(mixed), hookCtx());
  assert.equal(decision.kind, 'context');
  const text = decision.kind === 'context' ? decision.text : '';
  assert.match(text, /intents=[^ ]*backend/);
});

test('a pure question stays silent', async () => {
  assert.deepEqual(await run(promptOf('what does this function return?'), hookCtx()), silent);
});

test('a bare design word in ordinary prose claims no tier', async () => {
  assert.deepEqual(await run(promptOf('the button design looks good to me'), hookCtx()), silent);
});

test('a bare architecture word in ordinary prose claims no tier', async () => {
  assert.deepEqual(await run(promptOf('the architecture diagram in the doc is outdated'), hookCtx()), silent);
});

test('a question about the rules themselves stays silent', async () => {
  assert.deepEqual(await run(promptOf('what does base.md say about naming'), hookCtx()), silent);
});

// ------------------------------------------------------------------ guidance

test('scale guidance precedes route guidance in one context payload', async () => {
  const text = await guidance('Implement the notifications feature across all services');
  const big = text.indexOf('big-task signal');
  const route = text.indexOf('route escalation');
  assert.ok(big >= 0 && route > big, `want big-task before route escalation in: ${text}`);
});

test('spec authoring names the most-capable tier', async () => {
  assert.match(await guidance('Write the PRD for the billing rework'), /model: fable/);
});

// The scale rows of src/hooks/prompt-advisor.e2e.test.ts, prompt for prompt. Which of
// the three signals fires is the kernel's answer; which STRING each one prints
// is this adapter's, so the pairing is asserted here and not in scale.test.ts.
const SCALE_CASES: readonly (readonly [string, string])[] = [
  ['Refactor every component to the new theme API', 'big-task signal'],
  ['Should we use Kafka or SQS for this? design the flow', 'model: opus'],
  ["let's decompose this into smaller pieces", 'model: opus'],
  ['we should write an adr for this', 'model: opus'],
];

for (const [prompt, phrase] of SCALE_CASES) {
  test(`scale guidance on "${prompt}" names "${phrase}"`, async () => {
    const text = await guidance(prompt);
    assert.ok(text.includes(phrase), `want '${phrase}' in: ${text}`);
  });
}

test('a single service is not a fan-out either', async () => {
  const text = await advice('create a service to send the welcome email');
  assert.ok(!text.includes('big-task signal'), `a single service is not a fan-out: ${text}`);
});

test('an escalation names its reason and the agent that resolves it', async () => {
  const text = await guidance('add a paginated orders endpoint to the API and mirror the screen to mobile');
  assert.match(text, /route escalation/);
  assert.match(text, /multi-agent-dispatch/);
  assert.match(text, /`router` agent/);
});

test('an unrouted scale signal escalates with its own reason', async () => {
  assert.match(await guidance("let's decompose this into smaller pieces"), /unrouted-scale/);
});

test('a dispatch-plan intent escalates with its own reason', async () => {
  assert.match(await guidance('backfill the tenant column'), /requires-dispatch-plan/);
});

// The decision-rule rows of the bash suite. A matched rule reaching the payload
// by id is the whole contract here: the ids are the reader's handle on
// registries/decision-rules.json, so a note that summarised them would be a
// different feature wearing the same words.
const RULE_CASES: readonly (readonly [string, string])[] = [
  ['drop the legacy_id column from users', 'rule-destructive-ddl'],
  ['we leaked an api key in git', 'rule-secret-exposure'],
  ['add pagination across all endpoints', 'rule-fanout'],
  ['build a notifications module', 'rule-spec-threshold'],
  ['is this done?', 'rule-verification'],
  ['this is a breaking change to the orders API', 'rule-public-contract'],
  ['store the patient medical record', 'rule-sensitive-data'],
  ['rewrite the scheduler', 'rule-large-change'],
  ['should we fine-tune a model for this?', 'rule-volatile-knowledge'],
  ['truncate the events table', 'autonomy ceiling A3'],
];

for (const [prompt, phrase] of RULE_CASES) {
  test(`the decision rule on "${prompt}" reaches the payload as "${phrase}"`, async () => {
    const text = await guidance(prompt);
    assert.ok(text.includes(phrase), `want '${phrase}' in: ${text}`);
  });
}

test('a rule with a risk and no gate of its own labels neither a preference', async () => {
  const text = await guidance('drop the legacy_id column from users');
  assert.ok(
    text.includes(
      'rule-destructive-ddl — require: two-phase-deploy, explicit-confirmation, down-path-or-documented-irreversibility [risk: high]',
    ),
    `want the full field line in: ${text}`,
  );
  assert.ok(!text.includes('prefer:'), `a rule with no prefer must not print one: ${text}`);
});

test('reading code and a typo fix match no decision rule', async () => {
  for (const prompt of ['show me the order service', 'fix the typo in the readme']) {
    const text = await advice(prompt);
    assert.ok(!text.includes('decision rules matched'), `${prompt} matched a rule: ${text}`);
  }
});

test('every optional decision-rule field keeps its own label', async () => {
  const text = await guidance('should we fine-tune a model for this?');
  assert.ok(
    text.includes('rule-volatile-knowledge — require: retrieval-evaluation, freshness-policy — prefer: retrieval-over-fine-tuning'),
    `want the full field line in: ${text}`,
  );
});

test('a rule with a gate and a risk labels neither of them a preference', async () => {
  const text = await guidance('deploy the billing service to production');
  assert.ok(text.includes('rule-production-write'), `want the rule id in: ${text}`);
  assert.ok(text.includes('[gate: release] [risk: high]'), `want gate and risk in their own slots in: ${text}`);
  assert.match(text, /autonomy ceiling A3/);
  assert.ok(!text.includes('prefer:'), `a rule with no prefer must not print one: ${text}`);
});

// ------------------------------------------------- floor, gate and the mirror

test('a high risk floor with no classified tier is told to classify, not gated', async () => {
  const text = await guidance('fix the auth guard bug');
  assert.match(text, /task contract \(kernel, deterministic\)/);
  assert.match(text, /intents=security-files/);
  assert.match(text, /risk_floor=high/);
  assert.ok(!text.includes('route escalation'), `a resolved prompt carries no escalation: ${text}`);
  assert.ok(!text.includes('human-in-the-loop'), `a floor alone announces no gate: ${text}`);
  assert.match(text, /no tier has been classified/);
  assert.match(text, /not an approval gate/);
  // Exactly the contract line and the classify line: a third must not creep in.
  assert.equal(lines(text).length, 2);
});

// Secret rotation is a shortcut floor rules/risk-autonomy.md calls high
// outright, and it is the reason the compensating instruction exists at all: a
// bare contract line here would leave the highest floor in the registry silent.
test('a secret-rotation floor is told to classify and still gets no gate', async () => {
  const text = await guidance('rotate the stripe secret key');
  assert.match(text, /no tier has been classified/);
  assert.ok(!text.includes('human-in-the-loop'), `a floor alone announces no gate: ${text}`);
});

test('a matched high-risk rule announces the gate and does not also ask for a classification', async () => {
  const text = await guidance('drop the users table in production');
  assert.ok(
    text.includes('human-in-the-loop required — reasons: high-risk'),
    `want the gate with its reason id in: ${text}`,
  );
  assert.ok(!text.includes('no tier has been classified'), `a classified prompt is not told to classify: ${text}`);
});

test('a low floor gets its contract and neither of the two risk lines', async () => {
  const text = await guidance('add a component for the user avatar');
  assert.match(text, /task contract \(kernel, deterministic\)/);
  assert.ok(!text.includes('big-task signal'), `a single component is not a fan-out: ${text}`);
  assert.ok(!text.includes('no tier has been classified'), `a low floor is not told to classify: ${text}`);
  assert.ok(!text.includes('human-in-the-loop'), `a low floor announces no gate: ${text}`);
});

// ------------------------------------------------------------------ evidence

function adoptedRepo(t: TestContext): string {
  const repo = fixtureRepo(tempRoot(t));
  mkdirSync(join(repo, '.engineos'), { recursive: true });
  return repo;
}

test('an adopted repo receives the route denominator, the two conditional events and one router span', async (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  assert.equal((await run(promptOf('deploy the billing service to production', repo, 'unified1'), hookCtx())).kind, 'context');
  const telemetry = join(repo, '.git', 'engineos-telemetry');
  assert.deepEqual(
    jsonLines(join(telemetry, 'unified1.jsonl')).map((line) => line['event']),
    ['route', 'decision-rules', 'hitl'],
  );
  const spans = jsonLines(join(telemetry, 'unified1.exec.jsonl'));
  assert.equal(spans.length, 1);
  const span = first(spans);
  assert.equal(span['span_kind'], 'router');
  assert.equal(span['capability_id'], 'route');
  assert.equal(span['model_tier'], 'cheap');
  assert.equal(span['status'], 'OK');
  assert.equal(span['trace_id'], 'unified1');
  assert.equal(span['risk'], 'high');
  // A span the journal would reject on append is a span nobody ever reads, so
  // the duration's JSON TYPE is part of the contract, not an implementation
  // detail of the clock the harness happens to pass.
  assert.equal(typeof span['duration_ms'], 'number');
});

test('a prompt that resolves nothing still writes the route denominator and its span', async (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  assert.deepEqual(await run(promptOf('what does this function return?', repo, 'unified2'), hookCtx()), silent);
  const telemetry = join(repo, '.git', 'engineos-telemetry');
  assert.deepEqual(
    jsonLines(join(telemetry, 'unified2.jsonl')).map((line) => line['event']),
    ['route'],
  );
  assert.equal(jsonLines(join(telemetry, 'unified2.exec.jsonl')).length, 1);
});

test('the router span records the routed intent and the risk floor as ids', async (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  await run(promptOf('add a paginated orders endpoint to the API', repo, 'spans1'), hookCtx());
  const span = first(jsonLines(join(repo, '.git', 'engineos-telemetry', 'spans1.exec.jsonl')));
  assert.equal(span['route'], 'backend');
  // Asserted in both directions so the field cannot be a hardcoded tier: the
  // production prompt above writes `high` on the same field.
  assert.equal(span['risk'], 'medium');
});

test('no span field carries prompt text', async (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  await run(promptOf('add a paginated orders endpoint to the API zqxjkw', repo, 'spans3'), hookCtx());
  // Asserted on the FILE, not on the fields we happen to set: the slug class is
  // the whole guarantee, so a future field that leaked the prompt fails here.
  const raw = readFileSync(join(repo, '.git', 'engineos-telemetry', 'spans3.exec.jsonl'), 'utf8');
  assert.ok(!raw.includes('zqxjkw'), `the router span leaked prompt text: ${raw}`);
});

test('ENGINEOS_TELEMETRY=0 leaves no trace at all', async (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  const env: NodeJS.ProcessEnv = { ...ISOLATED, ENGINEOS_TELEMETRY: '0' };
  await run(promptOf('deploy the billing service to production', repo, 'spans5'), hookCtx(env));
  // The whole directory, not just the file: resolving it is what CREATES it, so
  // the switch has to be read before anything touches the repo.
  assert.equal(existsSync(join(repo, '.git', 'engineos-telemetry')), false);
});

test('a bypassed session writes no telemetry at all', async (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  const env: NodeJS.ProcessEnv = { ...ISOLATED, ENGINEOS_BYPASS: '1' };
  await run(promptOf('deploy the billing service to production', repo, 'spans7'), hookCtx(env));
  // EngineOS being off is not a decision worth recording, and recording it in
  // the project's git dir would be the one write a bypassed session still made.
  assert.equal(existsSync(join(repo, '.git', 'engineos-telemetry')), false);
});

test('a project that never adopted EngineOS is never written to', async (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  await run(promptOf('deploy the billing service to production', repo, 'spans6'), hookCtx());
  assert.equal(existsSync(join(repo, '.git', 'engineos-telemetry')), false);
});
