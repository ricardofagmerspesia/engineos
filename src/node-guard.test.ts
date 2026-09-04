import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentMajor, findNewerNode } from './node-guard';

test('currentMajor parses the leading integer', () => {
  assert.equal(currentMajor('16.17.0'), 16);
  assert.equal(currentMajor('22.23.2'), 22);
});

test('findNewerNode prefers the highest nvm version >= 18', () => {
  const fs = new Set(['/h/.nvm/versions/node', '/h/.nvm/versions/node/v16.17.0/bin/node', '/h/.nvm/versions/node/v20.19.3/bin/node', '/h/.nvm/versions/node/v22.23.2/bin/node']);
  const found = findNewerNode({ HOME: '/h' }, (p) => fs.has(p), () => ['v16.17.0', 'v20.19.3', 'v22.23.2']);
  assert.equal(found, '/h/.nvm/versions/node/v22.23.2/bin/node');
});

test('findNewerNode prefers the numerically highest patch inside one major', () => {
  const fs = new Set(['/h/.nvm/versions/node', '/h/.nvm/versions/node/v18.9.0/bin/node', '/h/.nvm/versions/node/v18.20.0/bin/node']);
  const found = findNewerNode({ HOME: '/h' }, (p) => fs.has(p), () => ['v18.9.0', 'v18.20.0']);
  assert.equal(found, '/h/.nvm/versions/node/v18.20.0/bin/node');
});

test('findNewerNode falls back to homebrew and /usr/local', () => {
  const found = findNewerNode({ HOME: '/h' }, (p) => p === '/usr/local/bin/node', () => []);
  assert.equal(found, '/usr/local/bin/node');
});

test('findNewerNode returns null when nothing qualifies', () => {
  assert.equal(findNewerNode({ HOME: '/h' }, () => false, () => []), null);
});
