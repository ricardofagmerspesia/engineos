import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { tempRoot, envelope } from '../testing/harness';
import { readEnvelope } from './envelope';
import { silent, type HookContext } from './output';
import { run, verify } from './post-edit-check';

// The legacy entrypoint can be rewired by a consumer. It must never probe a
// runner or execute per-edit scripts, regardless of files/tooling/environment.
const scenarios: {name: string; files: Record<string, string>; file: string}[] = [
  {name: 'red typecheck', files: {'package.json': '{"scripts":{"typecheck":"exit 1"}}'}, file: 'src/x.ts'},
  {name: 'green typecheck', files: {'package.json': '{"scripts":{"typecheck":"exit 0"}}'}, file: 'src/x.ts'},
  {name: 'missing typecheck', files: {'package.json': '{}'}, file: 'src/x.ts'},
  {name: 'red eslint', files: {'package.json': '{}', 'eslint.config.js': 'export default []'}, file: 'src/x.ts'},
  {name: 'biome and eslint together', files: {'package.json': '{}', 'eslint.config.js': '', 'biome.json': '{}'}, file: 'src/x.ts'},
  {name: 'Nx project', files: {'nx.json': '{}', 'project.json': '{"name":"api","targets":{"typecheck":{}}}'}, file: 'src/x.ts'},
  {name: 'Python venv', files: {'pyproject.toml': '[project]\nname="api"', '.venv/bin/pyright': '', '.venv/bin/ruff': ''}, file: 'src/x.py'},
  {name: 'mixed Node/Python', files: {'package.json': '{}', 'pyproject.toml': '[project]\nname="api"'}, file: 'src/x.ts'},
  {name: 'dependency edit', files: {'node_modules/pkg/package.json': '{"scripts":{"typecheck":"exit 1"}}'}, file: 'node_modules/pkg/x.ts'},
  {name: 'non-code edit', files: {}, file: 'notes.md'},
  {name: 'missing file', files: {}, file: 'src/ghost.ts'},
  {name: 'missing package', files: {}, file: 'src/x.ts'},
];
for (const scenario of scenarios) {
  test(`rewired per-edit hook runs no checks or probes for ${scenario.name}`, t => {
    const root = tempRoot(t);
    for (const [file, contents] of Object.entries(scenario.files)) {
      const path = join(root, file); mkdirSync(join(path, '..'), {recursive: true}); writeFileSync(path, contents);
    }
    const decoded = readEnvelope(memoryIo({stdin: envelope({event: 'PostToolUse', cwd: root, sid: 'session', tool: {name: 'Edit', input: {file_path: join(root, scenario.file)}}})}));
    assert.ok(decoded);
    let calls = 0;
    const spawn = new Proxy(spawnSync, {apply: () => {calls++; throw new Error('automatic runner call forbidden');}});
    const ctx: HookContext = {io: memoryIo({env: {ENGINEOS_VERIFY_TESTS: '1', ENGINEOS_VERIFY_APPROVED: '1'}}), root, now: () => 0, spawn};
    const decision = verify(decoded, ctx, spawn);
    assert.equal(decision.kind, 'message');
    assert.equal(run(decoded, ctx).kind, 'message');
    assert.equal(calls, 0);
  });
}
test('empty cwd or file remains silent without running anything', () => {
  const ctx: HookContext = {io: memoryIo(), root: '.', now: () => 0, spawn: new Proxy(spawnSync, {apply: () => {throw new Error('forbidden');}})};
  const cases: [string, string][] = [['', '/file.ts'], ['/repo', '']];
  for (const [cwd, file] of cases) {
    const decoded = readEnvelope(memoryIo({stdin: envelope({event: 'PostToolUse', cwd, sid: 'session', tool: {name: 'Edit', input: {file_path: file}}})}));
    assert.ok(decoded); assert.deepEqual(verify(decoded, ctx, ctx.spawn), silent);
  }
});
