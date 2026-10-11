import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRecord } from '../lib/json';
import { runInProcess, tempRoot } from '../testing/harness';
import { runSettingsMerge } from './cli';
import { SettingsMergeError, isEngineosCommand, mergeSettings, type MergeResult } from './settings-merge';

const ROOT = '/plugin/root';
const HOOKS_JSON = `${ROOT}/hooks/hooks.json`;
// The PR added the per-call bundle as a third accepted form, so the message
// the installer prints on an abort names all three.
const EXPECTED_FORMS =
  'Expected "${CLAUDE_PLUGIN_ROOT}"/hooks/<script>.sh, node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook <name> or node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-hot.cjs" hook <name>';

const OLD_STOP = '"${CLAUDE_PLUGIN_ROOT}"/hooks/stop-verify.sh';
const NEW_STOP = 'node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook stop-verify';
const NEW_ROUTE = 'node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook route-before-change';
const HOT_GUARD = 'node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-hot.cjs" hook git-write-guard';
const HOT_STOP = 'node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-hot.cjs" hook stop-verify';
const FOREIGN = '/opt/other-tool/on-stop.sh';

interface HookSource { event: string; matcher?: string; command: string }
interface HookEntry { matcher: string; commands: string[] }

function hooksFile(sources: HookSource[]): unknown {
  const hooks: Record<string, unknown[]> = {};
  for (const source of sources) {
    const list = hooks[source.event] ?? [];
    const entry: Record<string, unknown> = { hooks: [{ type: 'command', command: source.command }] };
    if (source.matcher !== undefined) entry['matcher'] = source.matcher;
    list.push(entry);
    hooks[source.event] = list;
  }
  return { hooks };
}

function entriesOf(settings: unknown, event: string): HookEntry[] {
  if (!isRecord(settings)) return [];
  const hooks = settings['hooks'];
  if (!isRecord(hooks)) return [];
  const raw = hooks[event];
  const list: unknown[] = Array.isArray(raw) ? raw : [];
  return list.map((entry) => {
    if (!isRecord(entry)) return { matcher: '', commands: [] };
    const rawInner = entry['hooks'];
    const inner: unknown[] = Array.isArray(rawInner) ? rawInner : [];
    return {
      matcher: typeof entry['matcher'] === 'string' ? entry['matcher'] : '',
      commands: inner.map((hook) => (isRecord(hook) && typeof hook['command'] === 'string' ? hook['command'] : '')),
    };
  });
}

function commandsOf(settings: unknown, event: string): string[] {
  return entriesOf(settings, event).flatMap((entry) => entry.commands);
}

function allowOf(settings: unknown): unknown[] {
  if (!isRecord(settings)) return [];
  const permissions = settings['permissions'];
  if (!isRecord(permissions)) return [];
  const allow = permissions['allow'];
  return Array.isArray(allow) ? allow : [];
}

function merge(settings: unknown, sources: HookSource[], template: unknown = null): { settings: unknown; result: MergeResult } {
  return mergeSettings(settings, hooksFile(sources), ROOT, template);
}

function abortOf(command: string): SettingsMergeError {
  try {
    merge({}, [{ event: 'Stop', command }]);
  } catch (error) {
    if (error instanceof SettingsMergeError) return error;
    throw error;
  }
  throw new Error(`expected the merge to abort on: ${command}`);
}

// ------------------------------------------------------------- isEngineosCommand

test('isEngineosCommand matches the hooks dir, its backslash form and the runtime bundle', () => {
  assert.equal(isEngineosCommand(`${ROOT}/hooks/stop-verify.sh`, ROOT), true);
  assert.equal(isEngineosCommand('C:\\plugin\\root\\hooks\\stop-verify.sh', 'C:/plugin/root'), true);
  assert.equal(isEngineosCommand('node "/somewhere/else/dist/engineos.cjs" hook stop-verify', ROOT), true);
  assert.equal(isEngineosCommand(FOREIGN, ROOT), false);
});

test('isEngineosCommand matches the per-call hook bundle, also from another checkout', () => {
  assert.equal(isEngineosCommand(`node "${ROOT}/dist/engineos-hot.cjs" hook git-write-guard`, ROOT), true);
  assert.equal(isEngineosCommand('node "/somewhere/else/dist/engineos-hot.cjs" hook git-write-guard', ROOT), true);
  assert.equal(isEngineosCommand('node "C:\\other\\dist\\engineos-hot.cjs" hook git-write-guard', ROOT), true);
});

test('isEngineosCommand does not claim a foreign bundle that merely ends in .cjs', () => {
  assert.equal(isEngineosCommand('node "/opt/tool/dist/other-hot.cjs" hook git-write-guard', ROOT), false);
});

test('isEngineosCommand ignores a trailing separator on the plugin root', () => {
  assert.equal(isEngineosCommand(`${ROOT}/hooks/stop-verify.sh`, `${ROOT}/`), true);
});

// -------------------------------------------------------------------- derivation

test('a fresh settings file gets every hook, with matcher fidelity', () => {
  const { settings, result } = merge({}, [
    { event: 'SessionStart', matcher: '', command: '"${CLAUDE_PLUGIN_ROOT}"/hooks/ensure-project-layout.sh' },
    { event: 'PreToolUse', matcher: 'Edit|Write', command: NEW_ROUTE },
    { event: 'Stop', command: NEW_STOP },
  ]);

  assert.deepEqual(result, { added: 3, removed: 0, changed: true });
  assert.deepEqual(commandsOf(settings, 'SessionStart'), [`${ROOT}/hooks/ensure-project-layout.sh`]);
  assert.deepEqual(entriesOf(settings, 'PreToolUse'), [
    { matcher: 'Edit|Write', commands: [`node "${ROOT}/dist/engineos.cjs" hook route-before-change`] },
  ]);
  // An absent matcher registers as '', never as undefined or a dropped key.
  assert.deepEqual(entriesOf(settings, 'Stop'), [
    { matcher: '', commands: [`node "${ROOT}/dist/engineos.cjs" hook stop-verify`] },
  ]);
});

test('the old form loses its quotes and the new form keeps them', () => {
  const { settings } = merge({}, [{ event: 'Stop', command: OLD_STOP }, { event: 'Stop', command: NEW_STOP }]);
  assert.deepEqual(commandsOf(settings, 'Stop'), [
    `${ROOT}/hooks/stop-verify.sh`,
    `node "${ROOT}/dist/engineos.cjs" hook stop-verify`,
  ]);
});

test('the per-call bundle form derives its name and keeps its quotes', () => {
  const { settings, result } = merge({}, [{ event: 'PreToolUse', matcher: 'Bash', command: HOT_GUARD }]);
  assert.deepEqual(result, { added: 1, removed: 0, changed: true });
  assert.deepEqual(entriesOf(settings, 'PreToolUse'), [
    { matcher: 'Bash', commands: [`node "${ROOT}/dist/engineos-hot.cjs" hook git-write-guard`] },
  ]);
});

test('a per-call bundle command whose derived name carries a space aborts naming the three accepted forms', () => {
  const error = abortOf('node "${CLAUDE_PLUGIN_ROOT}/dist/engineos-hot.cjs" hook git write guard');
  assert.match(error.message, /^ABORT: unrecognized hook command in /);
  assert.equal(error.detail, EXPECTED_FORMS);
});

test('hooks are added in hooks.json order under each event', () => {
  const { settings } = merge({}, [
    { event: 'PreToolUse', matcher: 'Edit', command: NEW_ROUTE },
    { event: 'PreToolUse', matcher: 'Agent', command: 'node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook announce-agent-dispatch' },
  ]);
  assert.deepEqual(entriesOf(settings, 'PreToolUse').map((entry) => entry.matcher), ['Edit', 'Agent']);
});

test('a plugin root carrying a dollar sign is substituted literally', () => {
  const root = '/opt/$share/engineos';
  const { settings } = mergeSettings({}, hooksFile([{ event: 'Stop', command: OLD_STOP }]), root, null);
  assert.deepEqual(commandsOf(settings, 'Stop'), [`${root}/hooks/stop-verify.sh`]);
});

// ------------------------------------------------------------------- abort cases

test('an empty derived name aborts with the installer message and the accepted forms', () => {
  const error = abortOf('"${CLAUDE_PLUGIN_ROOT}"/hooks/');
  assert.equal(error.message, `ABORT: unrecognized hook command in ${HOOKS_JSON}: "\${CLAUDE_PLUGIN_ROOT}"/hooks/`);
  assert.equal(error.detail, EXPECTED_FORMS);
});

test('a derived name containing a slash aborts', () => {
  const error = abortOf('"${CLAUDE_PLUGIN_ROOT}"/hooks/nested/stop-verify.sh');
  assert.match(error.message, /^ABORT: unrecognized hook command in /);
});

test('a derived name containing a backslash aborts', () => {
  const error = abortOf('"${CLAUDE_PLUGIN_ROOT}"/hooks/nested\\stop-verify.sh');
  assert.match(error.message, /^ABORT: unrecognized hook command in /);
});

test('a derived name containing a space aborts', () => {
  const error = abortOf('node "${CLAUDE_PLUGIN_ROOT}/dist/engineos.cjs" hook stop verify');
  assert.match(error.message, /^ABORT: unrecognized hook command in /);
});

test('a command in neither accepted form aborts rather than registering a path that never fires', () => {
  const error = abortOf('bash.exe "${CLAUDE_PLUGIN_ROOT}"/hooks/stop-verify.sh');
  assert.equal(error.message, `ABORT: unrecognized hook command in ${HOOKS_JSON}: bash.exe "\${CLAUDE_PLUGIN_ROOT}"/hooks/stop-verify.sh`);
});

test('the abort happens before the consumer settings are touched', () => {
  const settings = { hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: FOREIGN }] }] } };
  const snapshot = JSON.stringify(settings);
  assert.throws(() => merge(settings, [{ event: 'Stop', command: 'garbage' }]));
  assert.equal(JSON.stringify(settings), snapshot);
});

// ------------------------------------------------------------------------ scrub

test('prior EngineOS entries of both forms are scrubbed from every event', () => {
  const settings = {
    hooks: {
      Stop: [
        { matcher: '', hooks: [{ type: 'command', command: `${ROOT}/hooks/stop-verify.sh` }] },
        { matcher: '', hooks: [{ type: 'command', command: `node "${ROOT}/dist/engineos.cjs" hook stop-verify` }] },
      ],
      PostToolUse: [
        // A hook since retired: it disappears for good rather than firing beside the new set.
        { matcher: 'Edit', hooks: [{ type: 'command', command: `${ROOT}/hooks/post-edit-check.sh` }] },
      ],
    },
  };

  const { settings: merged, result } = merge(settings, [{ event: 'Stop', command: NEW_STOP }]);
  assert.equal(result.removed, 3);
  assert.equal(result.added, 1);
  assert.deepEqual(commandsOf(merged, 'Stop'), [`node "${ROOT}/dist/engineos.cjs" hook stop-verify`]);
  assert.deepEqual(commandsOf(merged, 'PostToolUse'), []);
});

test('an entry moved from the full bundle to the per-call bundle is scrubbed, not duplicated', () => {
  const settings = {
    hooks: {
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: `node "${ROOT}/dist/engineos.cjs" hook stop-verify` }] }],
    },
  };
  const { settings: merged, result } = merge(settings, [{ event: 'Stop', command: HOT_STOP }]);
  assert.equal(result.removed, 1);
  assert.equal(result.added, 1);
  assert.deepEqual(commandsOf(merged, 'Stop'), [`node "${ROOT}/dist/engineos-hot.cjs" hook stop-verify`]);
});

test('an entry moved from the per-call bundle of another checkout back to the full bundle is scrubbed, not duplicated', () => {
  const settings = {
    hooks: {
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'node "/old/checkout/dist/engineos-hot.cjs" hook stop-verify' }] }],
    },
  };
  const { settings: merged, result } = merge(settings, [{ event: 'Stop', command: NEW_STOP }]);
  assert.equal(result.removed, 1);
  assert.deepEqual(commandsOf(merged, 'Stop'), [`node "${ROOT}/dist/engineos.cjs" hook stop-verify`]);
});

test('a second install of the per-call form leaves exactly one entry', () => {
  const first = merge({}, [{ event: 'PreToolUse', matcher: 'Bash', command: HOT_GUARD }]);
  const second = merge(first.settings, [{ event: 'PreToolUse', matcher: 'Bash', command: HOT_GUARD }]);
  assert.deepEqual(commandsOf(second.settings, 'PreToolUse'), [`node "${ROOT}/dist/engineos-hot.cjs" hook git-write-guard`]);
});

test('a foreign hook survives in place, keeping its position and its siblings', () => {
  const settings = {
    hooks: {
      Stop: [
        { matcher: '', hooks: [{ type: 'command', command: FOREIGN }, { type: 'command', command: `${ROOT}/hooks/stop-verify.sh` }] },
      ],
    },
    statusLine: { type: 'command', command: 'my-status' },
  };

  const { settings: merged, result } = merge(settings, [{ event: 'Stop', command: NEW_STOP }]);
  assert.equal(result.removed, 1);
  assert.deepEqual(entriesOf(merged, 'Stop'), [
    { matcher: '', commands: [FOREIGN] },
    { matcher: '', commands: [`node "${ROOT}/dist/engineos.cjs" hook stop-verify`] },
  ]);
  // Unknown top-level keys pass through untouched.
  assert.deepEqual(isRecord(merged) ? merged['statusLine'] : undefined, { type: 'command', command: 'my-status' });
});

test('a second merge over its own output changes nothing', () => {
  const sources: HookSource[] = [
    { event: 'Stop', command: NEW_STOP },
    { event: 'PreToolUse', matcher: 'Edit|Write', command: NEW_ROUTE },
  ];
  const first = merge({}, sources);
  const second = merge(first.settings, sources);

  assert.equal(second.result.changed, false);
  assert.equal(second.result.added, 2);
  assert.equal(second.result.removed, 2);
  assert.equal(JSON.stringify(second.settings), JSON.stringify(first.settings));
});

// ------------------------------------------------------------------ permissions

test('the allowlist union preserves the existing order and appends template extras once', () => {
  const settings = { permissions: { allow: ['Bash(git status:*)', 'Bash(ls:*)'] } };
  const template = { allow: ['Bash(ls:*)', 'Bash(git diff:*)', 'Bash(git diff:*)'] };

  const { settings: merged } = merge(settings, [{ event: 'Stop', command: NEW_STOP }], template);
  assert.deepEqual(allowOf(merged), ['Bash(git status:*)', 'Bash(ls:*)', 'Bash(git diff:*)']);
});

test('an existing allowlist with duplicates is deduplicated without being sorted', () => {
  const settings = { permissions: { allow: ['Bash(zz:*)', 'Bash(aa:*)', 'Bash(zz:*)'] } };
  const { settings: merged } = merge(settings, [], { allow: [] });
  assert.deepEqual(allowOf(merged), ['Bash(zz:*)', 'Bash(aa:*)']);
});

test('a null template leaves permissions absent', () => {
  const { settings } = merge({}, [{ event: 'Stop', command: NEW_STOP }], null);
  assert.equal(isRecord(settings) ? 'permissions' in settings : true, false);
});

test('a template with no allow key still creates the permissions object', () => {
  const { settings } = merge({}, [], {});
  assert.deepEqual(allowOf(settings), []);
});

// ----------------------------------------------------------------- shape refusals

test('settings that are not a JSON object are refused', () => {
  for (const value of [[], 'settings', 3, null]) {
    assert.throws(() => merge(value, []), /settings\.json is not a JSON object/);
  }
});

test('an unusable hooks or permissions shape is refused rather than overwritten', () => {
  assert.throws(() => merge({ hooks: [] }, []), /settings\.json "hooks" is not a JSON object/);
  assert.throws(() => merge({ hooks: { Stop: 'nope' } }, []), /settings\.json "hooks\.Stop" is not an array/);
  assert.throws(() => merge({ permissions: [] }, [], { allow: [] }), /settings\.json "permissions" is not a JSON object/);
  assert.throws(() => merge({ permissions: { allow: 'nope' } }, [], { allow: [] }), /settings\.json "permissions\.allow" is not an array/);
});

test('a null hooks or permissions value defaults instead of failing', () => {
  const { settings } = merge({ hooks: null, permissions: null }, [{ event: 'Stop', command: NEW_STOP }], { allow: ['Bash(ls:*)'] });
  assert.deepEqual(commandsOf(settings, 'Stop'), [`node "${ROOT}/dist/engineos.cjs" hook stop-verify`]);
  assert.deepEqual(allowOf(settings), ['Bash(ls:*)']);
});

// -------------------------------------------------------------------------- CLI

interface Plugin { root: string; settings: string }

function plugin(root: string, opts: { hooks?: string; omitTemplate?: boolean } = {}): Plugin {
  const dir = join(root, 'plugin');
  mkdirSync(join(dir, 'hooks'), { recursive: true });
  const contents = opts.hooks ?? JSON.stringify(hooksFile([
    { event: 'Stop', command: NEW_STOP },
    { event: 'PreToolUse', matcher: 'Edit|Write', command: NEW_ROUTE },
  ]));
  writeFileSync(join(dir, 'hooks', 'hooks.json'), contents);
  if (opts.omitTemplate !== true) {
    mkdirSync(join(dir, 'templates'), { recursive: true });
    writeFileSync(join(dir, 'templates', 'permissions.template.json'), JSON.stringify({ allow: ['Bash(git status:*)'] }));
  }
  return { root: dir, settings: join(root, 'settings.json') };
}

function runMerge(target: Plugin, extra: string[] = []): { status: number; stdout: string; stderr: string } {
  return runInProcess(runSettingsMerge, ['--settings', target.settings, '--plugin-root', target.root, ...extra]);
}

function readSettings(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('missing arguments are refused with the usage line and exit 1', (t) => {
  const target = plugin(tempRoot(t));
  for (const argv of [[], ['--settings', target.settings], ['--plugin-root', target.root]]) {
    const run = runInProcess(runSettingsMerge, argv);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /^usage: engineos settings-merge --settings <path> --plugin-root <path> \[--dry-run\]\n$/);
  }
});

test('a flag without a value is refused', (t) => {
  const target = plugin(tempRoot(t));
  const run = runInProcess(runSettingsMerge, ['--settings', target.settings, '--plugin-root']);
  assert.equal(run.status, 1);
  assert.equal(run.stderr, '--plugin-root needs a path\n');
});

test('a missing settings file is created, and the run is silent on stdout', (t) => {
  const target = plugin(tempRoot(t));
  const run = runMerge(target);

  assert.equal(run.status, 0);
  assert.equal(run.stdout, '');
  const settings = readSettings(target.settings);
  assert.deepEqual(commandsOf(settings, 'Stop'), [`node "${target.root}/dist/engineos.cjs" hook stop-verify`]);
  assert.deepEqual(allowOf(settings), ['Bash(git status:*)']);
  assert.ok(readFileSync(target.settings, 'utf8').endsWith('}\n'));
});

test('the write is atomic and leaves no .tmp behind', (t) => {
  const target = plugin(tempRoot(t));
  assert.equal(runMerge(target).status, 0);
  assert.equal(existsSync(`${target.settings}.tmp`), false);
});

test('a reinstall over the previous output leaves one entry per hook', (t) => {
  const target = plugin(tempRoot(t));
  assert.equal(runMerge(target).status, 0);
  const first = readFileSync(target.settings, 'utf8');

  const second = runMerge(target, ['--dry-run']);
  assert.equal(second.status, 0);
  assert.deepEqual(JSON.parse(second.stdout), { added: 2, removed: 2, changed: false });
  assert.equal(runMerge(target).status, 0);
  assert.equal(readFileSync(target.settings, 'utf8'), first);
});

test('--dry-run prints the result and writes nothing', (t) => {
  const target = plugin(tempRoot(t));
  const run = runMerge(target, ['--dry-run']);

  assert.equal(run.status, 0);
  assert.deepEqual(JSON.parse(run.stdout), { added: 2, removed: 0, changed: true });
  assert.equal(existsSync(target.settings), false);
  assert.equal(existsSync(`${target.settings}.tmp`), false);
});

test('a missing permissions template warns on stderr and still merges the hooks', (t) => {
  const target = plugin(tempRoot(t), { omitTemplate: true });
  const run = runMerge(target);

  assert.equal(run.status, 0);
  assert.match(run.stderr, /^permissions template missing \(.*templates\/permissions\.template\.json\) — skipped allowlist merge\.\n$/);
  const settings = readSettings(target.settings);
  assert.equal(commandsOf(settings, 'Stop').length, 1);
  assert.equal(isRecord(settings) ? 'permissions' in settings : true, false);
});

test('an unreadable hooks.json exits 1 without writing settings', (t) => {
  const root = tempRoot(t);
  const settings = join(root, 'settings.json');
  const run = runInProcess(runSettingsMerge, ['--settings', settings, '--plugin-root', join(root, 'absent')]);

  assert.equal(run.status, 1);
  assert.match(run.stderr, /^cannot read .*\/absent\/hooks\/hooks\.json\n$/);
  assert.equal(existsSync(settings), false);
});

test('a malformed hooks.json exits 1', (t) => {
  const target = plugin(tempRoot(t), { hooks: '{ not json' });
  const run = runMerge(target);

  assert.equal(run.status, 1);
  assert.match(run.stderr, /^invalid JSON in .*\/hooks\/hooks\.json\n$/);
});

test('a malformed settings.json is refused and left alone', (t) => {
  const target = plugin(tempRoot(t));
  writeFileSync(target.settings, '{ not json');
  const run = runMerge(target);

  assert.equal(run.status, 1);
  assert.equal(run.stderr, 'settings.json is not a JSON object\n');
  assert.equal(readFileSync(target.settings, 'utf8'), '{ not json');
});

test('an unrecognized hook command exits 1 with the abort pair on stderr', (t) => {
  const target = plugin(tempRoot(t), { hooks: JSON.stringify(hooksFile([{ event: 'Stop', command: 'garbage' }])) });
  const run = runMerge(target);

  assert.equal(run.status, 1);
  assert.equal(run.stderr, `ABORT: unrecognized hook command in ${target.root}/hooks/hooks.json: garbage\n${EXPECTED_FORMS}\n`);
  assert.equal(existsSync(target.settings), false);
});
