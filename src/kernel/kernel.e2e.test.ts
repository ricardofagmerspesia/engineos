import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { isRecord, readJsonFile } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { relocatedRoot, runCli, tempRoot, type RunResult } from '../testing/harness';

// Black-box port of scripts/test-kernel.sh (route-path, route-intent, the
// positional fail-closed guards and the registry loader). Each `run <args>` of
// the bash suite is one test here, carrying that case's assertions; the suite
// drives the SHIPPED bundle against the SHIPPED registries, exactly as the bash
// suite did, so it stays a contract over the spawned kernel rather than a second
// copy of src/kernel/*.test.ts.

const ROOT = resolveRoot({}, __dirname);

function kernel(args: string[], env: Record<string, string> = {}): RunResult {
  return runCli(['kernel', ...args], { env });
}

function body(result: RunResult): Record<string, unknown> {
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isRecord(parsed)) throw new Error(`the kernel answered non-object JSON: ${result.stdout}`);
  return parsed;
}

// bash assert_ok: the run exited 0. stderr is reported on failure because the
// bash suite captured both streams into one buffer.
function okBody(result: RunResult): Record<string, unknown> {
  assert.equal(result.status, 0, `expected rc=0, got rc=${result.status}: ${result.stdout}${result.stderr}`);
  return body(result);
}

// bash assert_err: non-zero exit AND an {"error": ...} body on stdout.
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

// The registry-derived fixture inputs the bash suite read once at the top of the
// file: a re-parameterised registry must MOVE the fixtures, never turn them red.
const ROUTING = record(readJsonFile(join(ROOT, 'registries', 'routing.json')), 'registries/routing.json');

interface DomainSample {
  id: string;
  sample: string;
}

function domainSamples(): DomainSample[] {
  const domains = ROUTING['domains'];
  if (!Array.isArray(domains) || domains.length === 0) {
    throw new Error('registries/routing.json .domains is unusable');
  }
  return domains.map((row, i) => {
    const domain = record(row, `registries/routing.json .domains[${i}]`);
    const id = domain['id'];
    const sample = domain['sample_path'];
    if (typeof id !== 'string' || typeof sample !== 'string') {
      throw new Error(`registries/routing.json .domains[${i}] has no id/sample_path pair`);
    }
    return { id, sample };
  });
}

// ------------------------------------------------------------------ route-path

// Every domain in the registry must route its own sample_path back to itself.
// Looping the registry (not hardcoding domain ids) means a new domain added to
// routing.json is covered automatically.
for (const domain of domainSamples()) {
  test(`route-path(${domain.sample}) -> domain`, () => {
    assert.equal(okBody(kernel(['route-path', domain.sample]))['domain'], domain.id);
  });
}

test('excluded README.md exits 0', () => {
  const answer = okBody(kernel(['route-path', '/tmp/repo/README.md']));
  assert.equal(answer['domain'], null);
  assert.equal(answer['excluded'], true);
});

test('excluded .engineos path exits 0', () => {
  const answer = okBody(kernel(['route-path', '/tmp/x/.engineos/y.ts']));
  assert.equal(answer['domain'], null);
  assert.equal(answer['excluded'], true);
});

// EngineOS-self exclusion: .excluded.self_dirs is DATA, not code. This checkout's
// own hooks/ and docs/ trees get no routing; an unrelated project's hooks/ dir
// must still route, and dropping self_dirs from the registry must turn the
// exclusion off — which is what proves the list is data.
test('self hooks/anything.sh -> excluded', () => {
  assert.equal(okBody(kernel(['route-path', join(ROOT, 'hooks', 'anything.sh')]))['excluded'], true);
});

// The one bash case kept as bash: scripts/kernel.sh is a shim that resolves
// dist/engineos.cjs relative to ITSELF and exports its own ENGINEOS_ROOT, so
// nothing driven through runCli can prove it delegates. Everything else the bash
// suite asserted about relocated copies is asserted through ENGINEOS_ROOT below.
const bashAvailable = spawnSync('bash', ['-c', 'exit 0']).status === 0;

test(
  'scripts/kernel.sh delegates to the bundle and answers what the bundle answers',
  { skip: bashAvailable ? false : 'bash is not available on this machine' },
  () => {
    // A path outside the checkout on purpose: the shim computes its own
    // ENGINEOS_ROOT with a logical `pwd`, so a root-relative argument would
    // compare two different spellings of the same directory on a symlinked
    // checkout rather than comparing the two answers.
    const file = '/tmp/api/user.controller.ts';
    const shim = spawnSync('bash', [join(ROOT, 'scripts', 'kernel.sh'), 'route-path', file], { encoding: 'utf8' });
    assert.equal(shim.status, 0, `${shim.stdout ?? ''}${shim.stderr ?? ''}`);
    assert.equal(shim.stdout, kernel(['route-path', file]).stdout);
  },
);

// .ts, not .md: an .md basename is excluded anyway, so it would pass vacuously.
test('self docs/x.ts -> excluded', () => {
  assert.equal(okBody(kernel(['route-path', join(ROOT, 'docs', 'x.ts')]))['excluded'], true);
});

test("a foreign project's hooks/x.ts -> not excluded", () => {
  assert.equal(okBody(kernel(['route-path', '/some/project/hooks/x.ts']))['excluded'], false);
});

// Run as a MATCHED PAIR: without the `with` control, a `false` from the `without`
// half could just as well mean the relocated root never matched at all, and the
// sub-case would pass vacuously.
test("self_dirs present -> relocated root's own hooks/ excluded", (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t));
  const answer = okBody(kernel(['route-path', join(root, 'hooks', 'x.sh')], { ENGINEOS_ROOT: root }));
  assert.equal(answer['excluded'], true);
});

test('self_dirs removed -> own hooks/ no longer excluded', (t: TestContext) => {
  const root = relocatedRoot(tempRoot(t));
  // routing.json is not policy.json, so relocatedRoot's mutate hook does not
  // reach it: the copy is edited here instead.
  const path = join(root, 'registries', 'routing.json');
  const routing = record(readJsonFile(path), path);
  delete record(routing['excluded'], `${path} .excluded`)['self_dirs'];
  writeFileSync(path, `${JSON.stringify(routing, null, 2)}\n`);
  const answer = okBody(kernel(['route-path', join(root, 'hooks', 'x.sh')], { ENGINEOS_ROOT: root }));
  assert.equal(answer['excluded'], false);
});

test('unmatched random.py exits 0', () => {
  const answer = okBody(kernel(['route-path', '/tmp/other/random.py']));
  assert.equal(answer['domain'], null);
  assert.equal(answer['excluded'], false);
});

// Precedence: each of these paths is ambiguous against a less-specific domain
// and the higher-precedence domain must win.
test('auth/*.service.ts -> security, not backend', () => {
  assert.equal(okBody(kernel(['route-path', '/tmp/api/src/auth/login.service.ts']))['domain'], 'security');
});

test('mobile/*.tsx -> mobile, not frontend', () => {
  assert.equal(okBody(kernel(['route-path', '/tmp/apps/mobile/src/Home.tsx']))['domain'], 'mobile');
});

test('ios/fastlane/* -> ios-release, not mobile', () => {
  assert.equal(okBody(kernel(['route-path', '/tmp/app/ios/fastlane/Fastfile']))['domain'], 'ios-release');
});

// ---------------------------------------------------------------- route-intent

function matchIds(answer: Record<string, unknown>): string[] {
  const matches = answer['matches'];
  if (!Array.isArray(matches)) throw new Error(`no .matches array in ${JSON.stringify(answer)}`);
  return matches.map((row, i) => {
    const id = record(row, `.matches[${i}]`)['id'];
    if (typeof id !== 'string') throw new Error(`.matches[${i}].id is not a string`);
    return id;
  });
}

test("route-intent 'broken' prompt exits 0", () => {
  const answer = okBody(kernel(['route-intent', 'the login form is broken and users cannot sign in']));
  assert.ok(matchIds(answer).includes('bug'));
  assert.equal(answer['ambiguous'], false);
});

// No signal words at all -> zero matches, ambiguous true.
test('route-intent no-signal prompt exits 0', () => {
  const answer = okBody(kernel(['route-intent', 'the weather is nice today']));
  assert.deepEqual(matchIds(answer), []);
  assert.equal(answer['ambiguous'], true);
});

// Multi-match: "add" is a new-feature signal, "broken" is a bug signal; both fire
// from one prompt, proving multi-match (not first-match-wins here).
test('multi-match prompt exits 0', () => {
  const answer = okBody(kernel(['route-intent', 'add a fix for something broken']));
  const ids = matchIds(answer);
  assert.ok(ids.includes('new-feature'));
  assert.ok(ids.includes('bug'));
  assert.equal(answer['ambiguous'], false);
});

// Word-boundary proof: "addressed" contains the literal substring "add", but the
// new-feature signal "add" must NOT fire on it. ("review" legitimately fires the
// "review" intent here; that is expected and not what this case is checking.)
test('word-boundary prompt exits 0', () => {
  const answer = okBody(kernel(['route-intent', 'addressed the review comments']));
  assert.equal(matchIds(answer).includes('new-feature'), false);
});

// ---------------------------------------- positional subcommands fail closed
// The positional subcommands used to accept a flag SILENTLY: bash bound
// "--prompt" to $1 and the real argument was discarded, so route-intent answered
// about the literal string "--prompt" (which contains the LLM signal "prompt")
// and exited 0. A resolver that returns a confident wrong answer is worse than
// one that refuses.

for (const sub of ['route-path', 'route-intent']) {
  test(`${sub} rejects a --prompt flag instead of routing on the literal string`, () => {
    errorMessage(kernel([sub, '--prompt', 'audit the system']));
  });

  test(`${sub} rejects any leading-dash argument`, () => {
    errorMessage(kernel([sub, '-x']));
  });

  test(`${sub} with no argument errors`, () => {
    errorMessage(kernel([sub]));
  });

  test(`${sub} rejects a second positional argument`, () => {
    errorMessage(kernel([sub, 'one', 'two']));
  });
}

// Assert the GUARD fired, not merely that something errored — any other failure
// would also satisfy the cases above while leaving the fail-open path intact.
test("route-intent's error names the offending flag", () => {
  const result = kernel(['route-intent', '--prompt', 'audit the system']);
  assert.ok(errorMessage(result).includes('not a flag'));
  assert.equal('matches' in body(result), false);
});

// The correct positional form is untouched.
test('route-intent still answers the positional form', () => {
  assert.deepEqual(matchIds(okBody(kernel(['route-intent', 'audit the system']))), ['audit']);
});

test('route-path still answers the positional form', () => {
  assert.equal(okBody(kernel(['route-path', 'apps/api/src/orders/orders.service.ts']))['domain'], 'backend');
});

// ----------------------------------------------------------- registry loader
// Every registry read goes through one loader seam, so the seam owns the
// fail-closed behaviour. Each case hides exactly one registry, so a subcommand
// that stopped declaring one of its inputs — or that names the wrong one — fails
// here. A fresh relocated copy per case means the checkout is never touched.

function rootWithout(t: TestContext, registry: string): string {
  const root = relocatedRoot(tempRoot(t));
  rmSync(join(root, 'registries', registry));
  return root;
}

const LOADER_CASES: { missing: string; sub: string; args: string[] }[] = [
  { missing: 'routing.json', sub: 'route-path', args: ['src/x.ts'] },
  { missing: 'intents.json', sub: 'route-intent', args: ['anything'] },
  { missing: 'models.json', sub: 'model', args: ['--work', 'spec'] },
  { missing: 'policy.json', sub: 'gates', args: ['--risk', 'low'] },
  { missing: 'decision-rules.json', sub: 'decision-rules', args: ['--prompt', 'deploy'] },
];

for (const loaderCase of LOADER_CASES) {
  test(`${loaderCase.sub} without ${loaderCase.missing} exits 1 with .error naming the missing registry`, (t: TestContext) => {
    const root = rootWithout(t, loaderCase.missing);
    const result = kernel([loaderCase.sub, ...loaderCase.args], { ENGINEOS_ROOT: root });
    assert.equal(errorMessage(result), `registry missing: registries/${loaderCase.missing}`);
  });
}

// The composing subcommands must refuse with the same shaped error even when the
// missing registry is needed deep in the composition: a caller parses one stream
// either way, so "which registry" has to survive the composition.
const COMPOSED_CASES: { missing: string; sub: string }[] = [
  { missing: 'decision-rules.json', sub: 'resolve-task' },
  { missing: 'models.json', sub: 'route-escalate' },
];

for (const composed of COMPOSED_CASES) {
  test(`${composed.sub} without ${composed.missing} names the missing composed registry`, (t: TestContext) => {
    const root = rootWithout(t, composed.missing);
    const result = kernel([composed.sub, '--prompt', 'add an endpoint'], { ENGINEOS_ROOT: root });
    assert.equal(errorMessage(result), `registry missing: registries/${composed.missing}`);
  });
}
