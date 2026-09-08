// End-to-end contract for the unified UserPromptSubmit adapter, ported from
// hooks/test-prompt-advisor.sh. Every case drives the real bundle through the
// shared harness and asserts the injected `additionalContext`, so the strings
// asserted here are the ones a session actually receives.
//
// The bash suite it replaces had itself absorbed three retired suites —
// hooks/test-route-advisor.sh, hooks/test-task-scale.sh and
// hooks/test-gate-advisor.sh — and their sections are kept in place below.
//
// Sibling file prompt-advisor.test.ts covers the same behaviour in process by
// calling `run` directly; this one is deliberately black-box, because what the
// bash suite guarded was the shim, the CLI dispatch and the rendered JSON, none
// of which the in-process test can see.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { fixtureRepo, runCli, tempRoot, type RunResult } from '../testing/harness';

const checkout = resolveRoot({}, __dirname);

// The operator's machine-wide bypass must never decide a case; the bash suite
// exported the same isolation before its first assertion.
const ISOLATED: Record<string, string> = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

// The harness envelope() carries no prompt field, so a UserPromptSubmit payload
// is built here. Suite-local by the wave brief: the harness is another agent's
// file this wave.
function runAdvisor(payload: Record<string, unknown>, env: Record<string, string> = {}): RunResult {
  return runCli(['hook', 'prompt-advisor'], { stdin: JSON.stringify(payload), env: { ...ISOLATED, ...env } });
}

// A silent hook writes nothing at all, which is the empty string bash's
// `jq -r '.hookSpecificOutput.additionalContext // ""'` produced.
function additionalContext(stdout: string): string {
  if (stdout.trim() === '') return '';
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed)) return '';
  const hookSpecific = parsed['hookSpecificOutput'];
  if (!isRecord(hookSpecific)) return '';
  const text = hookSpecific['additionalContext'];
  return typeof text === 'string' ? text : '';
}

// Several bash cases assert two or three phrases against the SAME context, and
// each phrase is its own pass/fail there. Splitting them into one test each
// keeps the count and the messages; memoising keeps it from spawning the bundle
// forty times for a dozen distinct prompts. Safe because the guidance path is
// deterministic and writes nothing (telemetry is off, exactly as bash's
// `context()` had it).
const contexts = new Map<string, string>();

function guidance(prompt: string, env: Record<string, string> = {}): string {
  const key = JSON.stringify([prompt, env]);
  const cached = contexts.get(key);
  if (cached !== undefined) return cached;
  const result = runAdvisor({ prompt, cwd: '', session_id: 'test' }, { ENGINEOS_TELEMETRY: '0', ...env });
  const text = additionalContext(result.stdout);
  contexts.set(key, text);
  return text;
}

// bash's `case "$CTX" in *a*b*)`: the phrases must appear, and in this order.
function inOrder(text: string, parts: readonly string[]): boolean {
  let at = 0;
  for (const part of parts) {
    const found = text.indexOf(part, at);
    if (found < 0) return false;
    at = found + part.length;
  }
  return true;
}

function want(phrase: string, text: string, description: string): void {
  assert.ok(text.includes(phrase), `${description} — want '${phrase}' in: [${text}]`);
}

function absent(phrase: string, text: string, description: string): void {
  assert.ok(!text.includes(phrase), `${description} — did not want '${phrase}' in: [${text}]`);
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

// noUncheckedIndexedAccess makes every [0] optional; a missing first row is a
// failed test, not a value to narrow around at each call site.
function first(rows: Record<string, unknown>[]): Record<string, unknown> {
  const row = rows[0];
  if (row === undefined) throw new Error('no rows were written');
  return row;
}

function hasGit(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

// A git-inited project carrying the .engineos/ adoption marker every telemetry
// path checks for.
function adoptedRepo(t: TestContext): string {
  const repo = fixtureRepo(tempRoot(t));
  mkdirSync(join(repo, '.engineos'), { recursive: true });
  return repo;
}

function telemetryDir(repo: string): string {
  return join(repo, '.git', 'engineos-telemetry');
}

// ------------------------------------------------------- combined guidance

test('scale and route guidance are combined', () => {
  const text = guidance('Implement the notifications feature across all services');
  assert.ok(inOrder(text, ['big-task signal', 'route escalation']), `scale and route guidance are combined: ${text}`);
});

test('decision rule fields and high-risk ceiling are preserved', () => {
  const text = guidance('deploy the billing service to production');
  assert.ok(
    inOrder(text, ['rule-production-write', '[gate: release] [risk: high]', 'autonomy ceiling A3']),
    `decision rule fields and high-risk ceiling are preserved: ${text}`,
  );
});

test('spec authoring tier is preserved', () => {
  want('model: fable', guidance('Write the PRD for the billing rework'), 'spec authoring tier is preserved');
});

test('pure question should stay silent', () => {
  assert.equal(guidance('what does this function return?'), '');
});

test('bypass announcement is preserved', () => {
  want('BYPASS ACTIVE', guidance('deploy to production', { ENGINEOS_BYPASS: '1' }), 'bypass announcement is preserved');
});

// ------------------------------------------------------------ event stream

// Adopted repos receive one route event for every prompt, a decision event only
// when a decision rule matched, and a hitl event only when a human is required.
// rule-production-write carries risk=high, so this prompt fires all three.
test('unified telemetry stream is valid', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  runAdvisor({ prompt: 'deploy the billing service to production', cwd: repo, session_id: 'unified1' });
  const file = join(telemetryDir(repo), 'unified1.jsonl');
  const rows = jsonLines(file);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => row['event']),
    ['route', 'decision-rules', 'hitl'],
  );
  // `bash scripts/telemetry.sh validate` — the schema check, not a re-parse.
  assert.equal(runCli(['telemetry', 'validate', file]).status, 0);
});

test('zero-match prompt writes only the route denominator', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  runAdvisor({ prompt: 'what does this function return?', cwd: repo, session_id: 'unified2' });
  const rows = jsonLines(join(telemetryDir(repo), 'unified2.jsonl'));
  assert.equal(rows.length, 1);
  assert.equal(first(rows)['event'], 'route');
});

// ----------------------------------------------------------------- scale

// Scale guidance, folded in from the retired hooks/test-task-scale.sh. The
// unified adapter still emits a task contract for a one-unit prompt, so a small
// change must not trip the fan-out advice -- not that it must stay silent.
const SCALE_CASES: readonly (readonly [string, string])[] = [
  ['Refactor every component to the new theme API', 'big-task signal'],
  ['Should we use Kafka or SQS for this? design the flow', 'model: opus'],
  ["let's decompose this into smaller pieces", 'model: opus'],
  ['we should write an adr for this', 'model: opus'],
];

for (const [prompt, phrase] of SCALE_CASES) {
  test(`scale signal on '${prompt}'`, () => {
    want(phrase, guidance(prompt), `scale signal on '${prompt}'`);
  });
}

test('a single component is not a fan-out', () => {
  absent('big-task signal', guidance('add a component for the user avatar'), 'a single component is not a fan-out');
});

test('a single service is not a fan-out', () => {
  absent('big-task signal', guidance('create a service to send the welcome email'), 'a single service is not a fan-out');
});

// bare "design"/"architecture" in ordinary prose must claim no tier at all
test('bare design word stays quiet', () => {
  assert.equal(guidance('the button design looks good to me'), '');
});

test('bare architecture word stays quiet', () => {
  assert.equal(guidance('the architecture diagram in the doc is outdated'), '');
});

// -------------------------------------------------------- decision rules

// Folded in from the retired hooks/test-gate-advisor.sh. The destructive-DDL
// prompt keeps words between "drop" and "column" on purpose.
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
  test(`decision rule on '${prompt}'`, () => {
    want(phrase, guidance(prompt), `decision rule on '${prompt}'`);
  });
}

// Field labels. The rule id firing says nothing about which SLOT each value was
// printed in: a collapsed optional field still names the right rule while calling
// its gate a preference. Neither prompt below defines `prefer`, so a "prefer:"
// here is a shifted field, not registry content.
test('destructive DDL labels risk with no gate of its own', () => {
  want(
    'rule-destructive-ddl — require: two-phase-deploy, explicit-confirmation, down-path-or-documented-irreversibility [risk: high]',
    guidance('drop the legacy_id column from users'),
    'destructive DDL labels risk with no gate of its own',
  );
});

test('destructive DDL never labels its risk a preference', () => {
  absent('prefer:', guidance('drop the legacy_id column from users'), 'destructive DDL never labels its risk a preference');
});

test('production-write never labels its gate a preference', () => {
  absent('prefer:', guidance('deploy the billing service to production'), 'production-write never labels its gate a preference');
});

// The mirror case: a rule that really does define `prefer` must still print it,
// so a fix cannot pass by dropping the field instead of keeping it in its slot.
test('a rule that defines prefer still prints the prefer label', () => {
  want(
    'rule-volatile-knowledge — require: retrieval-evaluation, freshness-policy — prefer: retrieval-over-fine-tuning',
    guidance('should we fine-tune a model for this?'),
    'a rule that defines prefer still prints the prefer label',
  );
});

// Silence cases — the ones that keep the guidance usable.
test('plain question stays silent', () => {
  assert.equal(guidance('what does base.md say about naming'), '');
});

test('empty prompt stays silent', () => {
  assert.equal(guidance(''), '');
});

test('reading code matches no decision rule', () => {
  absent('decision rules matched', guidance('show me the order service'), 'reading code matches no decision rule');
});

test('a small fix matches no decision rule', () => {
  absent('decision rules matched', guidance('fix the typo in the readme'), 'a small fix matches no decision rule');
});

// ----------------------------------------------------- route resolution

// Folded in from the retired hooks/test-route-advisor.sh.
const MULTI_DOMAIN = 'add a paginated orders endpoint to the API and mirror the screen to mobile';

test('multi-agent dispatch escalates', () => {
  want('route escalation', guidance(MULTI_DOMAIN), 'multi-agent dispatch escalates');
});

test('the escalation notice names the reason', () => {
  want('multi-agent-dispatch', guidance(MULTI_DOMAIN), 'the escalation notice names the reason');
});

test('the escalation notice names the router agent', () => {
  want('`router` agent', guidance(MULTI_DOMAIN), 'the escalation notice names the router agent');
});

test('an unrouted scale signal escalates with its reason', () => {
  want('unrouted-scale', guidance("let's decompose this into smaller pieces"), 'an unrouted scale signal escalates with its reason');
});

test('a dispatch-plan intent escalates with its reason', () => {
  want('requires-dispatch-plan', guidance('backfill the tenant column'), 'a dispatch-plan intent escalates with its reason');
});

// A resolved single-domain prompt gets the deterministic contract line and no
// escalation. The security-files intent carries risk_floor: high, but a floor is
// an input to classification and not a classification, so there is no HITL gate.
// What there IS, and what asserting only the absence would let a defeated-in-
// effect fix pass, is the classification instruction: two lines, contract plus
// classify. The count is asserted so a third cannot creep in unnoticed.
const RESOLVED = 'fix the auth guard bug';

test('a resolved prompt does not escalate', () => {
  want('task contract (kernel, deterministic)', guidance(RESOLVED), 'a resolved prompt does not escalate');
});

test('the deterministic line names the resolved intent', () => {
  want('intents=security-files', guidance(RESOLVED), 'the deterministic line names the resolved intent');
});

test('a resolved prompt carries no escalation notice', () => {
  absent('route escalation', guidance(RESOLVED), 'a resolved prompt carries no escalation notice');
});

test('the contract line publishes the floor it resolved', () => {
  want('risk_floor=high', guidance(RESOLVED), 'the contract line publishes the floor it resolved');
});

test('a high risk floor on its own announces no HITL gate', () => {
  absent('human-in-the-loop', guidance(RESOLVED), 'a high risk floor on its own announces no HITL gate');
});

test('a high floor with no classified tier is told to classify', () => {
  want('no tier has been classified', guidance(RESOLVED), 'a high floor with no classified tier is told to classify');
});

test('the classification instruction says it is not a human-approval gate', () => {
  want('not an approval gate', guidance(RESOLVED), 'the classification instruction says it is not a human-approval gate');
});

test('deterministic output is exactly the contract line plus the classify line', () => {
  const text = guidance(RESOLVED);
  const announced = text.split('\n').filter((line) => line.startsWith('[engineos]'));
  assert.equal(announced.length, 2, `deterministic output is not exactly the contract line plus the classify line: [${text}]`);
});

// The same shape for the reason the compensating control exists: secret rotation
// is a shortcut floor rules/risk-autonomy.md calls high outright, and it must be
// told to classify rather than left with a bare contract line.
test('a secret-rotation prompt is told to classify its tier', () => {
  want('no tier has been classified', guidance('rotate the stripe secret key'), 'a secret-rotation prompt is told to classify its tier');
});

test('a secret-rotation prompt still gets no gate off the floor alone', () => {
  absent('human-in-the-loop', guidance('rotate the stripe secret key'), 'a secret-rotation prompt still gets no gate off the floor alone');
});

// The mirror: a matched decision rule carrying risk=high IS a classification, so
// the same adapter announces the gate with the reason id the kernel resolved,
// and does NOT also tell the reader to classify — the classification happened.
// Without this case, a hitl_note wired to nothing at all, or a classify_note
// that fired unconditionally, would still pass the assertions above.
test('a matched high-risk decision rule announces the HITL gate with its reason', () => {
  want(
    'human-in-the-loop required — reasons: high-risk',
    guidance('drop the users table in production'),
    'a matched high-risk decision rule announces the HITL gate with its reason',
  );
});

test('a classified prompt is not also told to classify', () => {
  absent('no tier has been classified', guidance('drop the users table in production'), 'a classified prompt is not also told to classify');
});

// And the low-floor mirror: neither line fires when the floor is not high.
test('a low-floor prompt still gets its contract', () => {
  want('task contract (kernel, deterministic)', guidance('add a component for the user avatar'), 'a low-floor prompt still gets its contract');
});

test('a low floor is not told to classify', () => {
  absent('no tier has been classified', guidance('add a component for the user avatar'), 'a low floor is not told to classify');
});

test('a low floor announces no HITL gate', () => {
  absent('human-in-the-loop', guidance('add a component for the user avatar'), 'a low floor announces no HITL gate');
});

// ------------------------------------------------------------ exit codes

// A hook that fails is a hook that blocks the prompt.
test('escalating prompt exits zero', () => {
  const result = runAdvisor({ prompt: MULTI_DOMAIN }, { ENGINEOS_TELEMETRY: '0' });
  assert.equal(result.status, 0);
});

test('malformed payload exits zero', () => {
  const result = runCli(['hook', 'prompt-advisor'], { stdin: 'not json at all', env: ISOLATED });
  assert.equal(result.status, 0);
});

// No jq. The adapter is node now, so the old form of this case ("no jq -> silent
// exit 0") would assert nothing: the shim reads no payload and the runtime never
// calls jq, so the hook cannot notice its absence. What the case still has to
// prove is that jq is no longer a DEPENDENCY, and the way to prove it is to run
// the hook with jq genuinely off PATH and require the guidance anyway. Dropping
// jq's dir from PATH is not enough on a machine with jq installed twice (e.g.
// /usr/bin AND a conda env), so build an isolated PATH with symlinks for exactly
// what the shim needs: dirname, and node.
//
// This is the one case that must stay a bash spawn: it exercises the SHIM's own
// dependency surface, which `runCli` bypasses by launching the bundle directly.
function onPath(name: string): string | null {
  for (const dir of (process.env['PATH'] ?? '').split(':')) {
    if (dir === '') continue;
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

test('no-jq run still answers', (t) => {
  const bash = onPath('bash');
  const dirname = onPath('dirname');
  if (bash === null || dirname === null) {
    t.skip('bash and dirname are required to exercise the shim');
    return;
  }
  const bin = join(tempRoot(t), 'bin');
  mkdirSync(bin, { recursive: true });
  symlinkSync(dirname, join(bin, 'dirname'));
  symlinkSync(process.execPath, join(bin, 'node'));
  const result = spawnSync(bash, [join(checkout, 'hooks', 'prompt-advisor.sh')], {
    input: '{"prompt":"implement the notifications feature across all services"}',
    env: { PATH: bin, ...ISOLATED },
    encoding: 'utf8',
  });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.equal(result.status, 0, `no-jq run — rc=${String(result.status)} out=[${out}], want rc=0`);
  want('big-task signal', out, 'no-jq run still answers');
});

// ---------------------------------------------------- telemetry switches

test('ENGINEOS_TELEMETRY=0 writes no telemetry file', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  runAdvisor({ prompt: 'deploy the billing service to production', cwd: repo, session_id: 'unified3' }, { ENGINEOS_TELEMETRY: '0' });
  // The whole directory, not just the file: resolving it is what CREATES it.
  assert.equal(existsSync(telemetryDir(repo)), false);
});

test('a repo that never adopted EngineOS writes no telemetry file', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  runAdvisor({ prompt: 'deploy the billing service to production', cwd: repo, session_id: 'unified4' });
  assert.equal(existsSync(telemetryDir(repo)), false);
});

// -------------------------------------------------------------- spans

// Agent traces: the same resolve-task call that produces the route EVENT also
// produces a router SPAN — the event carries the decision, the span carries how
// long it took (rules/observability.md "Agent traces"). Ids only: the routed
// intent and the risk floor, never the prompt.
test('a resolved prompt writes one valid router span', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  runAdvisor({ prompt: 'add a paginated orders endpoint to the API', cwd: repo, session_id: 'spans1' });
  const file = join(telemetryDir(repo), 'spans1.exec.jsonl');
  const spans = jsonLines(file);
  assert.equal(spans.length, 1);
  const span = first(spans);
  assert.equal(span['span_kind'], 'router');
  assert.equal(span['capability_id'], 'route');
  assert.equal(span['trace_id'], 'spans1');
  assert.equal(span['route'], 'backend');
  assert.equal(span['risk'], 'medium');
  assert.equal(typeof span['duration_ms'], 'number');
  // `bash scripts/exec-journal.sh validate` — the schema check on the file.
  assert.equal(runCli(['journal', 'validate', file]).status, 0);
});

// The other risk direction, so the span cannot be a hardcoded "medium".
test('a high-floor prompt writes risk=high on its router span', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  runAdvisor({ prompt: 'deploy the billing service to production', cwd: repo, session_id: 'spans2' });
  const span = first(jsonLines(join(telemetryDir(repo), 'spans2.exec.jsonl')));
  assert.equal(span['risk'], 'high');
});

test('the router span never leaks prompt text', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  runAdvisor({ prompt: 'add a paginated orders endpoint to the API zqxjkw', cwd: repo, session_id: 'spans3' });
  // Asserted on the FILE, not on the fields we happen to set: the slug class is
  // the whole guarantee, so a future field that leaked the prompt has to fail here.
  const raw = readFileSync(join(telemetryDir(repo), 'spans3.exec.jsonl'), 'utf8');
  assert.ok(!raw.includes('zqxjkw'), `the router span leaked prompt text: ${raw}`);
});

// A pure question resolves nothing worth announcing, but the resolve-task call
// still happened, so its span is still the honest record of it.
test('a silent prompt still writes its router span', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  runAdvisor({ prompt: 'what does this function return?', cwd: repo, session_id: 'spans4' });
  const span = first(jsonLines(join(telemetryDir(repo), 'spans4.exec.jsonl')));
  assert.equal(span['span_kind'], 'router');
});

// The two off-switches, for the span file specifically.
test('ENGINEOS_TELEMETRY=0 writes no span file', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  runAdvisor({ prompt: 'deploy the billing service to production', cwd: repo, session_id: 'spans5' }, { ENGINEOS_TELEMETRY: '0' });
  assert.equal(existsSync(telemetryDir(repo)), false);
});

test('a repo that never adopted EngineOS writes no span file', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = fixtureRepo(tempRoot(t));
  runAdvisor({ prompt: 'deploy the billing service to production', cwd: repo, session_id: 'spans6' });
  assert.equal(existsSync(telemetryDir(repo)), false);
});

test('a bypassed session writes no span file', (t) => {
  if (!hasGit()) {
    t.skip('git is not installed');
    return;
  }
  const repo = adoptedRepo(t);
  runAdvisor({ prompt: 'deploy the billing service to production', cwd: repo, session_id: 'spans7' }, { ENGINEOS_BYPASS: '1' });
  // EngineOS being off is not a decision worth recording, and recording it in
  // the project's git dir would be the one write a bypassed session still made.
  assert.equal(existsSync(telemetryDir(repo)), false);
});
