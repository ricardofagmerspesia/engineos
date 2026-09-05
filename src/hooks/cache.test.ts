import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeCachePaths } from './cache';

test('the cache key is the session, the registry signature and the buster', () => {
  const paths = routeCachePaths('/r/.git', 'S1', '1712-4096', '0', 'src/orders/service.ts');
  assert.deepEqual(paths, {
    route: '/r/.git/engineos-route-cache/S1-1712-4096-0/src/orders/service.ts.route',
    output: '/r/.git/engineos-route-cache/S1-1712-4096-0/src/orders/service.ts.route.output',
  });
});

test('an operator buster changes the key, so the whole session re-routes', () => {
  const before = routeCachePaths('/r/.git', 'S1', 'sig', '0', 'a.ts');
  const after = routeCachePaths('/r/.git', 'S1', 'sig', '7', 'a.ts');
  assert.notEqual(before?.route, after?.route);
  assert.equal(after?.route, '/r/.git/engineos-route-cache/S1-sig-7/a.ts.route');
});

test('an absent buster reads as the default, not as an empty segment', () => {
  assert.equal(
    routeCachePaths('/r/.git', 'S1', 'sig', '', 'a.ts')?.route,
    '/r/.git/engineos-route-cache/S1-sig-0/a.ts.route',
  );
});

test('a session id from the harness is slugged one character at a time', () => {
  // Dots survive (they are in the slug class) but every separator is replaced,
  // so a hostile id stays one directory name and cannot traverse.
  assert.equal(
    routeCachePaths('/r/.git', '../../etc S1', 'sig', '0', 'a.ts')?.route,
    '/r/.git/engineos-route-cache/.._.._etc_S1-sig-0/a.ts.route',
  );
});

test('a path with a .. segment is never cached', () => {
  assert.equal(routeCachePaths('/r/.git', 'S1', 'sig', '0', '../outside.ts'), null);
  assert.equal(routeCachePaths('/r/.git', 'S1', 'sig', '0', 'src/../../outside.ts'), null);
  assert.equal(routeCachePaths('/r/.git', 'S1', 'sig', '0', 'src/..'), null);
});

test('a path with a . segment is never cached', () => {
  assert.equal(routeCachePaths('/r/.git', 'S1', 'sig', '0', './a.ts'), null);
  assert.equal(routeCachePaths('/r/.git', 'S1', 'sig', '0', 'src/./a.ts'), null);
});

test('a dotted file name is not a dotted segment', () => {
  assert.equal(
    routeCachePaths('/r/.git', 'S1', 'sig', '0', 'src/..hidden.ts')?.route,
    '/r/.git/engineos-route-cache/S1-sig-0/src/..hidden.ts.route',
  );
});

test('no git dir and no relative path both mean no cache', () => {
  assert.equal(routeCachePaths('', 'S1', 'sig', '0', 'a.ts'), null);
  assert.equal(routeCachePaths('/r/.git', 'S1', 'sig', '0', ''), null);
});
