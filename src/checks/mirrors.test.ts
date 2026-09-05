import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { lazyRegistries } from '../kernel/context';
import { resolveRoot } from '../registry/paths';
import type { CheckId } from './ids';
import type { CheckContext } from './lib';
import { resolveRegistryPath, runMirrors, sliceSection } from './mirror';
import { MIRRORS, rowsOf } from './mirrors';

const root = resolveRoot(process.env, __dirname);

// The checks whose registry-to-document pairs are data. C28's pair is
// document-to-document — its metric list is a bash constant with no registry
// side — so it has no row here and stays code until that list moves into a
// registry. Every other mirror check in the design's list is covered.
const PORTED: readonly CheckId[] = ['C16', 'C19b', 'C19c', 'C20c', 'C21b', 'C21e', 'C23', 'C24c', 'C25c', 'C26c', 'C27d'];

const ctx: CheckContext = {
  root,
  io: memoryIo(),
  registries: lazyRegistries(root),
  skipped: new Set<string>(),
  readText(relativePath: string): string | undefined {
    try {
      return readFileSync(join(root, relativePath), 'utf8');
    } catch {
      return undefined;
    }
  },
  exists: (relativePath: string): boolean => existsSync(join(root, relativePath)),
  list: (relativeDir: string): string[] => readdirSync(join(root, relativeDir)),
};

test('every row carries a finding code that is well formed and unique within its check', () => {
  const seen = new Set<string>();
  for (const row of MIRRORS) {
    assert.match(row.id, /^[a-z][a-z0-9-]*$/, `${row.check} row id '${row.id}'`);
    const key = `${row.check}:${row.id}`;
    assert.equal(seen.has(key), false, `duplicate finding code ${key}`);
    seen.add(key);
  }
});

test('every row names a document that exists and a section that is in it', () => {
  for (const row of MIRRORS) {
    const text = ctx.readText(row.doc);
    assert.notEqual(text, undefined, `${row.id}: ${row.doc} is missing`);
    if (text === undefined) continue;
    if (row.scope === 'file') {
      assert.equal(row.anchor, undefined, `${row.id}: a file-scoped row must not carry an anchor`);
      continue;
    }
    const anchor = row.anchor;
    assert.notEqual(anchor, undefined, `${row.id}: needs an anchor or scope: 'file'`);
    if (anchor === undefined) continue;
    const section = sliceSection(text, anchor);
    assert.notEqual(section, undefined, `${row.id}: ${row.doc} has no '${anchor}'`);
    assert.notEqual(section?.trim(), '', `${row.id}: '${anchor}' is empty`);
  }
});

test('every row resolves against the shipped registries to a non-empty list', () => {
  for (const row of MIRRORS) {
    const values = resolveRegistryPath(root, row.registry);
    assert.ok(values.length > 0, `${row.id}: ${row.registry} resolves to nothing`);
    if (row.kind === 'quotes') assert.equal(values.length, 1, `${row.id}: ${row.registry} is not one scalar`);
  }
});

test('every ported mirror check has at least one row', () => {
  for (const check of PORTED) assert.ok(rowsOf(check).length > 0, `${check} has no mirror rows`);
  // rowsOf answers only its own check, so a family runs its rows and nobody
  // else's.
  for (const row of rowsOf('C16')) assert.equal(row.check, 'C16');
});

// The acceptance the design asks for: the table is a claim about THIS tree, and
// a row that cannot hold on the shipped documents is a row that never fires.
test('the whole table holds against the shipped documents and registries', () => {
  assert.deepEqual(runMirrors(MIRRORS, ctx), []);
});
