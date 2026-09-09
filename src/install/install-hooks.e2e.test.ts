// Spawned end-to-end contract for the installer's hook registration — the port
// of hooks/test-install-hooks.sh, one subtest per bash case, in the bash suite's
// order.
//
// This is the ONE suite in the migration that reaches for node:child_process
// directly instead of the shared harness. The subject under test is install.sh
// itself, which stays bash (plan Tasks 42-57), and `runCli` only ever spawns
// `node dist/engineos.cjs` — so there is no harness call that can drive the real
// installer. src/install/settings-merge.test.ts covers the same merge rules in
// process, against an in-memory settings object; this file exists for the half
// that one cannot reach: the real installer, over a real HOME, writing a real
// settings.json, with no stub and no extracted copy of the merge program that
// could drift from the shipped one.
//
// Isolation is the throwaway HOME alone, exactly as in bash: install.sh writes
// only under $HOME/.claude, and its secrets gate scans REPO_DIR — the checkout,
// through `git ls-files` — never the temp tree. The bash suite needed no guard
// against that gate and neither does this port; the temp HOME is simply not a
// place the gate looks.
//
// install.ps1 mirrors this logic and is not exercised here: it is covered by the
// package job's windows-latest leg in ci.yml, which lints it with PSScriptAnalyzer
// and runs it for real against a scratch -ClaudeDir.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { isRecord, readJsonFile } from '../lib/json';
import { tempRoot } from '../testing/harness';

// Compiled tests run from build/install/, so two levels up is the checkout —
// the same directory install.sh derives as REPO_DIR from its own BASH_SOURCE.
const checkout = resolve(__dirname, '..', '..');
const HOOKS_JSON = join(checkout, 'hooks', 'hooks.json');

// Single-quoted so TypeScript never interpolates the shell placeholder.
const PLACEHOLDER = '${CLAUDE_PLUGIN_ROOT}';

// Previous versions of this installer registered all four. They are planted in
// the old `<repo>/hooks/<x>.sh` form on purpose — that is what an old install
// left behind, and the hooks-dir half of the scrub is what has to catch it.
const RETIRED = ['post-edit-check.sh', 'task-scale-advisor.sh', 'gate-advisor.sh', 'route-advisor.sh'];

// Somebody else's tool, in an event EngineOS also uses.
const FOREIGN = '/opt/other-tool/on-stop.sh';

interface HookRef { event: string; matcher: string; command: string }

// ------------------------------------------------------------------ helpers

function hasBash(): boolean {
  return spawnSync('bash', ['--version'], { encoding: 'utf8' }).status === 0;
}

// bash `install_run`: the whole installer against a throwaway HOME. The node
// running this suite is put at the front of PATH because install.sh registers
// nothing at all under a node below 18 — an ambient older node on PATH would
// turn every assertion below into the same unhelpful "no hooks" failure.
// The bash suite discarded the installer's exit code; this port asserts it,
// so an installer that aborts is reported as an abort rather than as a
// mismatched hook list.
function installRun(fakeHome: string): void {
  const env: Record<string, string> = {
    PATH: `${dirname(process.execPath)}${delimiter}${process.env['PATH'] ?? ''}`,
    HOME: fakeHome,
  };
  const tmp = process.env['TMPDIR'];
  if (tmp !== undefined) env['TMPDIR'] = tmp;
  const result = spawnSync('bash', [join(checkout, 'install.sh')], {
    env,
    cwd: checkout,
    encoding: 'utf8',
  });
  if (result.error !== undefined) throw new Error(`could not spawn install.sh: ${result.error.message}`);
  assert.equal(result.status, 0, `install.sh exited ${String(result.status)}\n${result.stdout}\n${result.stderr}`);
}

function settingsPath(fakeHome: string): string {
  return join(fakeHome, '.claude', 'settings.json');
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readJsonRecord(path: string): Record<string, unknown> {
  const parsed = readJsonFile(path);
  if (!isRecord(parsed)) throw new Error(`${path} is not a JSON object`);
  return parsed;
}

function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

// Every hook registration a settings.json or hooks.json carries, flattened.
// This is the jq walk both `expected` and `registered` shared, and the same one
// `entry_count` counted.
function hookRefs(source: unknown): HookRef[] {
  const refs: HookRef[] = [];
  const container = isRecord(source) ? source['hooks'] : undefined;
  if (!isRecord(container)) return refs;
  for (const [event, value] of Object.entries(container)) {
    for (const entry of asArray(value)) {
      if (!isRecord(entry)) continue;
      const matcher = typeof entry['matcher'] === 'string' ? entry['matcher'] : '';
      for (const hook of asArray(entry['hooks'])) {
        const command = isRecord(hook) && typeof hook['command'] === 'string' ? hook['command'] : '';
        refs.push({ event, matcher, command });
      }
    }
  }
  return refs;
}

function sortedLines(refs: HookRef[]): string[] {
  return refs.map((ref) => `${ref.event} ${ref.matcher} ${ref.command}`).sort();
}

// Every command hooks.json asks for, with the placeholder resolved to this
// checkout. The placeholder sits INSIDE the quoted script argument of a
// `node "..." hook <name>` command, so only the placeholder itself is replaced —
// the surrounding quotes are part of the command and stay. split/join rather
// than replace: a `$` in the checkout path would be read as a replacement
// pattern otherwise.
function expectedLines(): string[] {
  return sortedLines(hookRefs(readJsonFile(HOOKS_JSON)).map((ref) => ({
    ...ref,
    command: ref.command.split(PLACEHOLDER).join(checkout),
  })));
}

// What is actually registered, in the same shape.
function registeredLines(fakeHome: string): string[] {
  return sortedLines(hookRefs(readJsonRecord(settingsPath(fakeHome))));
}

// How many hook entries a settings/hooks.json file carries in total.
function entryCount(source: unknown): number {
  return hookRefs(source).length;
}

function appendHookEntry(settings: Record<string, unknown>, ref: HookRef): void {
  const existing = settings['hooks'];
  const events: Record<string, unknown> = isRecord(existing) ? existing : {};
  const entries = asArray(events[ref.event]);
  entries.push({ matcher: ref.matcher, hooks: [{ type: 'command', command: ref.command }] });
  events[ref.event] = entries;
  settings['hooks'] = events;
}

// The `<repo>/hooks/<name>.sh` list a consumer upgrading from 1.6.x carries,
// derived from the same hooks.json the node form is derived from.
function bashEraRefs(): HookRef[] {
  return hookRefs(readJsonFile(HOOKS_JSON)).map((ref) => {
    const name = /hook ([a-z-]+)$/.exec(ref.command)?.[1];
    if (name === undefined) throw new Error(`hooks.json command is not in the node form: ${ref.command}`);
    return { ...ref, command: `${checkout}/hooks/${name}.sh` };
  });
}

// ------------------------------------------------------------------- the port

// One outer test so the nine cases share a single throwaway HOME and run in the
// bash suite's order: each case installs over the settings.json the previous one
// left, which is the whole point of the reinstall and scrub assertions.
test('install.sh hook registration', async (t: TestContext) => {
  if (!hasBash()) {
    t.skip('bash is not installed');
    return;
  }
  const fakeHome = tempRoot(t);
  const settings = settingsPath(fakeHome);
  const want = expectedLines();

  installRun(fakeHome);

  await t.test('install.sh writes a settings.json', () => {
    assert.equal(existsSync(settings), true);
  });

  await t.test('registered hooks == hooks.json', () => {
    assert.deepEqual(registeredLines(fakeHome), want);
  });

  // The point of deriving: the adapter hooks.json registers is the one installed.
  await t.test('prompt-advisor is registered', () => {
    assert.equal(registeredLines(fakeHome).some((line) => line.includes('hook prompt-advisor')), true);
  });

  // Idempotent: a second run must not duplicate or reorder anything.
  await t.test('a second install.sh run does not change settings.json', () => {
    const before = readFileSync(settings, 'utf8');
    installRun(fakeHome);
    assert.equal(readFileSync(settings, 'utf8'), before);
  });

  // A retired hook left behind by an older install gets dropped, not kept beside
  // the current list.
  await t.test('retired hooks do not survive the install', () => {
    const planted = readJsonRecord(settings);
    for (const retired of RETIRED) {
      appendHookEntry(planted, { event: 'UserPromptSubmit', matcher: '', command: `${checkout}/hooks/${retired}` });
    }
    writeJsonFile(settings, planted);
    installRun(fakeHome);
    const got = registeredLines(fakeHome);
    const stale = RETIRED.filter((retired) => got.some((line) => line.includes(retired)));
    assert.deepEqual(stale, [], `retired hooks survived the install: ${stale.join(' ')}`);
  });

  await t.test("cleaning retired hooks restores hooks.json's list", () => {
    assert.deepEqual(registeredLines(fakeHome), want);
  });

  // Reinstall over a bash-era settings.json: a consumer upgrading from 1.6.x
  // carries the full `<repo>/hooks/<name>.sh` list. Every one of those must be
  // scrubbed and replaced by the node form — if the scrub keyed only on
  // dist/engineos.cjs, the old entries would survive and every hook would fire
  // twice, once per form.
  await t.test('bash-era entries are replaced by the node form', () => {
    const planted = readJsonRecord(settings);
    for (const ref of bashEraRefs()) appendHookEntry(planted, ref);
    writeJsonFile(settings, planted);
    installRun(fakeHome);
    assert.deepEqual(registeredLines(fakeHome), want);
  });

  await t.test("reinstall leaves exactly hooks.json's entry count", () => {
    assert.equal(entryCount(readJsonRecord(settings)), entryCount(readJsonFile(HOOKS_JSON)));
  });

  // A foreign hook in the same events is somebody else's tool — never scrubbed.
  await t.test('install.sh keeps a hook it does not own', () => {
    const planted = readJsonRecord(settings);
    appendHookEntry(planted, { event: 'Stop', matcher: '', command: FOREIGN });
    writeJsonFile(settings, planted);
    installRun(fakeHome);
    assert.equal(registeredLines(fakeHome).some((line) => line.includes(FOREIGN)), true);
  });
});
