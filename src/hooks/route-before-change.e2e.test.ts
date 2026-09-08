// E2E contract for the routing hook as the harness actually invokes it: a
// PreToolUse envelope on the stdin of a spawned `engineos hook
// route-before-change`, plus `engineos kernel route-path` for the exclusion
// rules. Ported from hooks/test-route.sh, case for case, in the same order.
//
// The ten guidance strings are asserted WHOLE. Matching only the agent name
// would let a wrong or stale rules list through, which is the regression the
// bash suite existed to catch. The strings are what the kernel RENDERS for each
// registries/routing.json domain row (rules[], skills[], agent, hint) — the
// registry stopped storing them.
//
// ./route-before-change.test.ts is the in-process half and owns the internals
// (cache formats, sentinels, decision shapes); this file asserts only what a
// caller outside the process can see.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../lib/json';
import { resolveRoot } from '../registry/paths';
import { envelope, fixtureRepo, runCli, tempRoot } from '../testing/harness';

const root = resolveRoot({}, __dirname);

// hooks/test-route.sh:9 — the machine-wide bypass flag is pointed at a path that
// cannot exist, so an operator's pause can never make this suite go quiet and
// report green. ENGINEOS_BYPASS itself is already kept out by the harness env
// allowlist.
const ISOLATED: Record<string, string> = { ENGINEOS_BYPASS_FLAG: '/nonexistent/engineos.bypass' };

const FRONTEND = 'rules/frontend.md+architecture.md+testing.md | skill:react-patterns | agent:frontend-coordinator';
const BACKEND = 'rules/backend.md+architecture.md+data.md+testing.md+observability.md | skill:nestjs-patterns | agent:backend-coordinator';
const DBA = 'rules/data.md+architecture.md | agent:dba-coordinator (postgres/oracle)';
const DEVOPS = 'rules/architecture.md+observability.md | agent:devops-coordinator (kubernetes/gcp/cicd)';
const LLM = 'rules/llm-apps.md | skill:llm-engineering | agent:llm-coordinator';
const TEST_GUIDE = 'rules/testing.md | agent:test-writer';
const SECURITY = 'rules/security.md | agent:security-reviewer';
const MOBILE = 'rules/frontend.md+architecture.md+backend.md+testing.md+observability.md | skill:react-patterns | agent:mobile-coordinator (adapt to React Native)';
const IOS_BUILD = 'rules/security.md | agent:ios-builder (signing)';
const ANDROID_BUILD = 'rules/security.md | agent:android-builder (signing)';

// ------------------------------------------------------------------ helpers

// jq '.hookSpecificOutput.additionalContext // ""' over the hook's stdout. A
// silent decision writes nothing at all, which reads back as the same empty
// string the bash suite treated as "no routing".
function additionalContext(stdout: string): string {
  const trimmed = stdout.trim();
  if (trimmed === '') return '';
  const parsed: unknown = JSON.parse(trimmed);
  if (!isRecord(parsed)) return '';
  const specific = parsed['hookSpecificOutput'];
  if (!isRecord(specific)) return '';
  const injected = specific['additionalContext'];
  return typeof injected === 'string' ? injected : '';
}

// One Edit on <temp>/<relative>. The temp dir is not a git repo, which is the
// state the bash cases ran in (they named /tmp paths that did not exist): no
// route cache, no change-record note, so the injected line is the guidance and
// nothing else.
function editContext(t: TestContext, relative: string): string {
  const cwd = tempRoot(t);
  const result = runCli(['hook', 'route-before-change'], {
    stdin: envelope({
      event: 'PreToolUse',
      cwd,
      sid: 'route',
      tool: { name: 'Edit', input: { file_path: join(cwd, relative) } },
    }),
    env: ISOLATED,
  });
  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);
  return additionalContext(result.stdout);
}

// The bash `case "$ctx" in *"$exp"*)` containment check, kept as containment: a
// project CLAUDE.md above the temp dir would append a note the bash suite also
// tolerated.
function assertGuidance(actual: string, expected: string): void {
  assert.ok(actual.includes(expected), `want '${expected}' in: [${actual}]`);
}

// bash `kernel.sh route-path "$path" | jq -e '.excluded == true'` — asserted on
// the kernel's own JSON, so these cases test the shipped resolver rather than a
// wrapper. A non-zero exit reads as "routed", the way the failing jq did.
function assertRoutePath(path: string, want: 'excluded' | 'routed'): void {
  const result = runCli(['kernel', 'route-path', path]);
  let excluded = false;
  if (result.status === 0) {
    const parsed: unknown = JSON.parse(result.stdout);
    excluded = isRecord(parsed) && parsed['excluded'] === true;
  }
  const got = excluded ? 'excluded' : 'routed';
  assert.equal(got, want, `${path}: want ${want} got ${got}`);
}

function cacheTree(repo: string): string {
  return join(repo, '.git', 'engineos-route-cache');
}

// bash `find "$CACHE_DIR" -type f -name '*.route'`. The sibling .route.output
// entries are excluded by the suffix, exactly as the find was.
function routeEntries(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const name of names) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...routeEntries(path));
    else if (name.endsWith('.route')) found.push(path);
  }
  return found;
}

// The cache cases need a git dir to write into; the routing cases above do not.
function cacheEdit(repo: string): string {
  return envelope({
    event: 'PreToolUse',
    cwd: repo,
    sid: 'route-cache',
    tool: { name: 'Edit', input: { file_path: join(repo, 'src', 'Button.tsx') } },
  });
}

// ------------------------------------------------------------------ routing

test('tsx -> frontend', (t) => {
  assertGuidance(editContext(t, 'app/Button.tsx'), FRONTEND);
});

test('controller -> backend', (t) => {
  assertGuidance(editContext(t, 'api/user.controller.ts'), BACKEND);
});

test('sql -> dba', (t) => {
  assertGuidance(editContext(t, 'db/001_init.sql'), DBA);
});

test('workflow -> devops', (t) => {
  assertGuidance(editContext(t, 'proj/.github/workflows/ci.yml'), DEVOPS);
});

test('dockerfile -> devops', (t) => {
  assertGuidance(editContext(t, 'proj/Dockerfile'), DEVOPS);
});

test('docker-compose -> devops', (t) => {
  assertGuidance(editContext(t, 'proj/docker-compose.yml'), DEVOPS);
});

test('terraform dir -> devops', (t) => {
  assertGuidance(editContext(t, 'infra/terraform/main.tf'), DEVOPS);
});

test('jenkinsfile -> devops', (t) => {
  assertGuidance(editContext(t, 'proj/Jenkinsfile'), DEVOPS);
});

test('prompt -> llm', (t) => {
  assertGuidance(editContext(t, 'ai/prompt-builder.ts'), LLM);
});

test('spec -> test', (t) => {
  assertGuidance(editContext(t, 'api/user.service.spec.ts'), TEST_GUIDE);
});

test('auth -> security', (t) => {
  assertGuidance(editContext(t, 'api/auth.guard.ts'), SECURITY);
});

test('auth dir -> security', (t) => {
  assertGuidance(editContext(t, 'api/src/auth/login.service.ts'), SECURITY);
});

// mobile precedes frontend: RN screens are .tsx but belong to mobile-coordinator

test('rn screen -> mobile', (t) => {
  assertGuidance(editContext(t, 'apps/mobile/src/Home.tsx'), MOBILE);
});

test('native suffix -> mobile', (t) => {
  assertGuidance(editContext(t, 'lib/Sheet.native.tsx'), MOBILE);
});

test('ios dir -> mobile', (t) => {
  assertGuidance(editContext(t, 'ios/App/AppDelegate.swift'), MOBILE);
});

// store-builder precedes mobile: release plumbing gets ios-builder/android-builder,
// not mobile-coordinator, even though it lives under ios/ or android/.

test('fastlane -> ios-builder', (t) => {
  assertGuidance(editContext(t, 'ios/fastlane/Fastfile'), IOS_BUILD);
});

test('info.plist -> ios-builder', (t) => {
  assertGuidance(editContext(t, 'app/ios/App/Info.plist'), IOS_BUILD);
});

test('podfile -> ios-builder', (t) => {
  assertGuidance(editContext(t, 'app/ios/Podfile'), IOS_BUILD);
});

test('android gradle -> android-builder', (t) => {
  assertGuidance(editContext(t, 'android/app/build.gradle'), ANDROID_BUILD);
});

test('keystore -> android-builder', (t) => {
  assertGuidance(editContext(t, 'android/release.keystore'), ANDROID_BUILD);
});

// queue/pipeline backend suffixes

test('processor -> backend', (t) => {
  assertGuidance(editContext(t, 'api/src/jobs/email.processor.ts'), BACKEND);
});

test('consumer -> backend', (t) => {
  assertGuidance(editContext(t, 'api/src/queue/orders.consumer.ts'), BACKEND);
});

test('interceptor -> backend', (t) => {
  assertGuidance(editContext(t, 'api/src/common/logging.interceptor.ts'), BACKEND);
});

// regression: unanchored globs used to mis-route these

test('storage is NOT llm', (t) => {
  assert.equal(editContext(t, 'api/src/storage/index.ts'), '');
});

test('paragraph is NOT llm', (t) => {
  assert.equal(editContext(t, 'lib/paragraph/split.ts'), '');
});

test('evaluate is NOT llm', (t) => {
  assert.equal(editContext(t, 'api/orders/evaluate.ts'), '');
});

test('nest src/app NOT front', (t) => {
  assert.equal(editContext(t, 'api/src/app/config.ts'), '');
});

test('llm dir -> llm', (t) => {
  assertGuidance(editContext(t, 'api/src/llm/client.ts'), LLM);
});

test('evals dir -> llm', (t) => {
  assertGuidance(editContext(t, 'api/src/evals/golden.ts'), LLM);
});

test('excluded .engineos/', (t) => {
  assert.equal(editContext(t, 'repo/.engineos/changes/x.md'), '');
});

test('excluded .engineos ts', (t) => {
  assert.equal(editContext(t, 'repo/.engineos/notes.ts'), '');
});

test('excluded md', (t) => {
  assert.equal(editContext(t, 'repo/README.md'), '');
});

// regression: unanchored *auth*/*guard*/*middleware* used to catch these — now
// delimiter-bounded so "authors/" (a resource name) doesn't collide with "auth/"
// (the security-sensitive directory).

test('authors ctrl NOT security', (t) => {
  assertGuidance(editContext(t, 'api/src/authors/author.controller.ts'), BACKEND);
});

// --- exclusion unit checks, against the kernel's JSON contract ------------------
// The generic */hooks/*, */docs/* exclusions used to swallow ANY project's own
// src/hooks/ or product docs/ dir. They must only exclude EngineOS's own hooks/
// and docs/ trees — registries/routing.json .excluded.self_dirs, resolved by the
// kernel against its own root — while .engineos/ stays excluded everywhere
// (generic, not EngineOS-repo-specific).

test('generic project src/hooks/ not swallowed', () => {
  assertRoutePath('/some/project/src/hooks/useAuth.ts', 'routed');
});

test('generic project hooks/ ts not swallowed', () => {
  assertRoutePath('/some/project/hooks/x.ts', 'routed');
});

test('generic project docs/ ts not swallowed', () => {
  assertRoutePath('/some/project/docs/notes.ts', 'routed');
});

test("EngineOS's own hooks/ file excluded", () => {
  assertRoutePath(join(root, 'hooks', 'x.sh'), 'excluded');
});

test("EngineOS's own docs/ file excluded", () => {
  assertRoutePath(join(root, 'docs', 'x.ts'), 'excluded');
});

test('.engineos/ exclusion stays generic', () => {
  assertRoutePath('/some/project/.engineos/changes/x.ts', 'excluded');
});

// Session cache: the same path reuses one entry; a buster produces a distinct
// key, proving invalidation does not require deleting or mutating source files.

test('repeated route should reuse one session cache entry', (t) => {
  const repo = fixtureRepo(tempRoot(t));
  const stdin = cacheEdit(repo);
  const first = additionalContext(runCli(['hook', 'route-before-change'], { stdin, env: ISOLATED }).stdout);
  const second = additionalContext(runCli(['hook', 'route-before-change'], { stdin, env: ISOLATED }).stdout);
  assert.notEqual(first, '');
  assert.equal(second, first);
  assert.equal(routeEntries(cacheTree(repo)).length, 1);
});

test('route cache buster should create an invalidated entry', (t) => {
  const repo = fixtureRepo(tempRoot(t));
  const stdin = cacheEdit(repo);
  // Self-contained rather than continuing the previous case's tree: the first
  // fire writes the un-busted entry, the second must not reuse it.
  runCli(['hook', 'route-before-change'], { stdin, env: ISOLATED });
  runCli(['hook', 'route-before-change'], { stdin, env: { ...ISOLATED, ENGINEOS_ROUTE_CACHE_BUSTER: 'changed' } });
  assert.equal(routeEntries(cacheTree(repo)).length, 2);
});
