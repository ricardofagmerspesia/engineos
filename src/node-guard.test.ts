import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentMajor, findNewerNode, guardOutcome, MIN_NODE_MAJOR, SILENT_HOOKS } from './node-guard';

test('currentMajor parses the leading integer', () => {
  assert.equal(currentMajor('16.17.0'), 16);
  assert.equal(currentMajor('22.23.2'), 22);
});

test('currentMajor falls back to 0 on an unparseable version', () => {
  assert.equal(currentMajor('not-a-version'), 0);
});

test('findNewerNode prefers the highest nvm version >= 18', () => {
  const fs = new Set(['/h/.nvm/versions/node', '/h/.nvm/versions/node/v16.17.0/bin/node', '/h/.nvm/versions/node/v20.19.3/bin/node', '/h/.nvm/versions/node/v22.23.2/bin/node']);
  const found = findNewerNode({ HOME: '/h' }, (p) => fs.has(p), () => ['v16.17.0', 'v20.19.3', 'v22.23.2'], () => true);
  assert.equal(found, '/h/.nvm/versions/node/v22.23.2/bin/node');
});

test('findNewerNode prefers the numerically highest patch inside one major', () => {
  const fs = new Set(['/h/.nvm/versions/node', '/h/.nvm/versions/node/v18.9.0/bin/node', '/h/.nvm/versions/node/v18.20.0/bin/node']);
  const found = findNewerNode({ HOME: '/h' }, (p) => fs.has(p), () => ['v18.9.0', 'v18.20.0'], () => true);
  assert.equal(found, '/h/.nvm/versions/node/v18.20.0/bin/node');
});

test('findNewerNode falls back to homebrew and /usr/local', () => {
  const found = findNewerNode({ HOME: '/h' }, (p) => p === '/usr/local/bin/node', () => [], () => true);
  assert.equal(found, '/usr/local/bin/node');
});

test('findNewerNode returns null when nothing qualifies', () => {
  assert.equal(findNewerNode({ HOME: '/h' }, () => false, () => [], () => true), null);
});

test('findNewerNode swallows a listDir failure (file or unreadable versions dir) and falls through', () => {
  const found = findNewerNode(
    { HOME: '/h' },
    (p) => p === '/h/.nvm/versions/node',
    () => {
      throw new Error('ENOTDIR: not a directory');
    },
    () => true,
  );
  assert.equal(found, null);
});

test('findNewerNode falls through to homebrew when the versions dir cannot be listed', () => {
  const fs = new Set(['/h/.nvm/versions/node', '/opt/homebrew/bin/node']);
  const found = findNewerNode(
    { HOME: '/h' },
    (p) => fs.has(p),
    () => {
      throw new Error('EACCES: permission denied');
    },
    () => true,
  );
  assert.equal(found, '/opt/homebrew/bin/node');
});

test('findNewerNode skips a candidate that exists but is not executable', () => {
  const fs = new Set(['/h/.nvm/versions/node', '/h/.nvm/versions/node/v20.0.0/bin/node']);
  const found = findNewerNode({ HOME: '/h' }, (p) => fs.has(p), () => ['v20.0.0'], () => false);
  assert.equal(found, null);
});

test('findNewerNode falls back to homebrew when the nvm candidate is not executable', () => {
  const fs = new Set(['/h/.nvm/versions/node', '/h/.nvm/versions/node/v20.0.0/bin/node', '/usr/local/bin/node']);
  const found = findNewerNode(
    { HOME: '/h' },
    (p) => fs.has(p),
    () => ['v20.0.0'],
    (p) => p === '/usr/local/bin/node',
  );
  assert.equal(found, '/usr/local/bin/node');
});

test('junk directory entries are excluded from the major filter', () => {
  const found = findNewerNode({ HOME: '/h' }, (p) => p === '/h/.nvm/versions/node', () => ['.DS_Store'], () => true);
  assert.equal(found, null);
});

test('parseVersion normalizes v-prefix and missing components to zero', () => {
  for (const name of ['v18', '18.0.0', 'v18.x']) {
    const bin = `/h/.nvm/versions/node/${name}/bin/node`;
    const fs = new Set(['/h/.nvm/versions/node', bin]);
    const found = findNewerNode({ HOME: '/h' }, (p) => fs.has(p), () => [name], () => true);
    assert.equal(found, bin, `expected ${name} to normalize to a matching v18.0.0-equivalent candidate`);
  }
});

test('sort over junk-suffixed and clean version names picks the highest patch', () => {
  const names = ['v18.x', 'v18.20.0', 'v18.9.0'];
  const fs = new Set(names.map((v) => `/h/.nvm/versions/node/${v}/bin/node`));
  fs.add('/h/.nvm/versions/node');
  const found = findNewerNode({ HOME: '/h' }, (p) => fs.has(p), () => names, () => true);
  assert.equal(found, '/h/.nvm/versions/node/v18.20.0/bin/node');
});

test('guardOutcome proceeds when the running node already meets the floor', () => {
  assert.deepEqual(guardOutcome(['hook', 'anything'], '22.0.0', null), { kind: 'proceed' });
});

test('guardOutcome re-execs when a newer node candidate is available', () => {
  assert.deepEqual(guardOutcome(['dispatch'], '16.0.0', '/opt/homebrew/bin/node'), { kind: 'reexec', bin: '/opt/homebrew/bin/node' });
});

test('guardOutcome is silent for every hook in SILENT_HOOKS', () => {
  for (const hook of SILENT_HOOKS) {
    assert.deepEqual(guardOutcome(['hook', hook], '16.0.0', null), { kind: 'silent' });
  }
});

test('guardOutcome skips with the exact message text for a non-silent hook', () => {
  const outcome = guardOutcome(['hook', 'stop-verify'], '16.0.0', null);
  assert.deepEqual(outcome, { kind: 'skip', message: `[engineos] stop-verify skipped: node >= ${MIN_NODE_MAJOR} required (found v16.0.0)` });
});

test('guardOutcome refuses non-hook invocations with the exact message text', () => {
  const outcome = guardOutcome(['dispatch'], '16.0.0', null);
  assert.deepEqual(outcome, { kind: 'refuse', message: `node >= ${MIN_NODE_MAJOR} required, found v16.0.0` });
});
