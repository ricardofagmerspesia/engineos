import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { TestContext } from 'node:test';
import { memoryIo } from '../io';
import { KernelError } from '../lib/json';
import { lazyRegistries } from '../kernel/context';
import { tempRoot } from '../testing/harness';
import type { CheckContext } from './lib';
import type { MirrorBase, MirrorPair } from './mirrors';
import { resolveRegistryPath, runMirrors, sliceSection } from './mirror';

const POLICY = JSON.stringify({
  gates: { ladder: ['discovery', 'design'] },
  parallelism: { wave_concurrency_cap: 6 },
  empty_list: [],
  pairs: [
    { id: 'a', value: 'alpha' },
    { id: 'b', value: 'beta' },
  ],
});

const DOC = [
  '# Fixture',
  '',
  '## Vocabulary',
  '',
  '| `discovery` | the first gate |',
  '| `design` | the second gate |',
  '',
  '## Numbers',
  '',
  'Cap concurrency at ~6 agents per wave.',
  '',
  '## Empty',
  '',
  '## Tail',
  '',
  'discovery appears here too, outside every table.',
  '',
].join('\n');

// A row builder rather than a fixture table: every case differs in one field,
// and spelling out ten near-identical literals hides which field is the case.
type RowOverrides = Partial<MirrorBase> & (
  | { kind: 'names'; element?: string }
  | { kind: 'quotes'; pattern?: string }
);

function row(overrides: RowOverrides): MirrorPair {
  const base: MirrorBase = {
    id: 'row', check: 'C16', registry: 'policy.gates.ladder',
    doc: 'doc.md', anchor: '## Vocabulary', direction: 'doc-names-registry',
  };
  if (overrides.kind === 'names') {
    return { ...base, ...overrides, kind: 'names', element: overrides.element ?? '^\\| `{x}`' };
  }
  return { ...base, ...overrides, kind: 'quotes', pattern: overrides.pattern ?? 'Cap concurrency at ~{n}' };
}

function fixture(t: TestContext, files: Record<string, string> = {}): CheckContext {
  const root = tempRoot(t);
  const all: Record<string, string> = { 'registries/policy.json': POLICY, 'doc.md': DOC, ...files };
  for (const [relativePath, contents] of Object.entries(all)) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return {
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
}

test('a row whose document is absent reports the document, not its elements', (t) => {
  const findings = runMirrors([row({ kind: 'names', doc: 'gone.md' })], fixture(t));
  assert.deepEqual(findings, [{ code: 'row', subject: 'doc-missing:gone.md' }]);
});

test('a missing anchor and an empty section are each their own finding', (t) => {
  const ctx = fixture(t);
  assert.deepEqual(runMirrors([row({ kind: 'names', anchor: '## Nope' })], ctx),
    [{ code: 'row', subject: 'section-missing:## Nope' }]);
  assert.deepEqual(runMirrors([row({ kind: 'names', anchor: '## Empty' })], ctx),
    [{ code: 'row', subject: 'section-empty:## Empty' }]);
});

test('an empty or unresolvable registry list is a finding, never a silent pass', (t) => {
  const ctx = fixture(t);
  assert.deepEqual(runMirrors([row({ kind: 'names', registry: 'policy.empty_list' })], ctx),
    [{ code: 'row', subject: 'registry-empty:policy.empty_list' }]);
  assert.deepEqual(runMirrors([row({ kind: 'names', registry: 'policy.absent.thing' })], ctx),
    [{ code: 'row', subject: 'registry-empty:policy.absent.thing' }]);
});

test('a row with no placeholder is a table bug and throws rather than passing', (t) => {
  const ctx = fixture(t);
  assert.throws(() => runMirrors([row({ kind: 'names', element: '^\\| `discovery`' })], ctx), KernelError);
  assert.throws(() => runMirrors([row({ kind: 'quotes', pattern: 'Cap concurrency at ~6' })], ctx), KernelError);
});

test('a row with neither an anchor nor scope: file is a table bug and throws', (t) => {
  const ctx = fixture(t);
  const anchorless: MirrorPair = { id: 'row', check: 'C16', registry: 'policy.gates.ladder', doc: 'doc.md', direction: 'doc-names-registry', kind: 'names', element: '{x}' };
  assert.throws(() => runMirrors([anchorless], ctx), KernelError);
});

test('every registry element the section does not name is a finding, subject the element', (t) => {
  const ctx = fixture(t, { 'doc.md': DOC.replace('| `design` | the second gate |\n', '') });
  assert.deepEqual(runMirrors([row({ kind: 'names' })], ctx), [{ code: 'row', subject: 'design' }]);
});

test('both directions: a row the registry does not declare is reported as undeclared', (t) => {
  const ctx = fixture(t, { 'doc.md': DOC.replace('## Numbers', '| `ghost` | invented here |\n\n## Numbers') });
  assert.deepEqual(runMirrors([row({ kind: 'names', direction: 'both' })], ctx),
    [{ code: 'row', subject: 'undeclared:ghost' }]);
  // The same tree passes when only the forward direction is asked for.
  assert.deepEqual(runMirrors([row({ kind: 'names' })], ctx), []);
});

test('a quoted number must match once and equal the registry scalar', (t) => {
  const ctx = fixture(t, {
    'doc.md': DOC,
    'twice.md': '## Numbers\n\nCap concurrency at ~6 and Cap concurrency at ~6.\n',
    'wrong.md': '## Numbers\n\nCap concurrency at ~7 agents.\n',
    'none.md': '## Numbers\n\nNo number lives here.\n',
  });
  const quoted = { kind: 'quotes', registry: 'policy.parallelism.wave_concurrency_cap', anchor: '## Numbers' } as const;
  assert.deepEqual(runMirrors([row({ ...quoted })], ctx), []);
  assert.deepEqual(runMirrors([row({ ...quoted, doc: 'twice.md' })], ctx),
    [{ code: 'row', subject: 'pattern-ambiguous' }]);
  assert.deepEqual(runMirrors([row({ ...quoted, doc: 'wrong.md' })], ctx),
    [{ code: 'row', subject: '7!=6' }]);
  assert.deepEqual(runMirrors([row({ ...quoted, doc: 'none.md' })], ctx),
    [{ code: 'row', subject: 'pattern-missing' }]);
  // A list where a scalar was promised cannot be compared to one number.
  assert.deepEqual(runMirrors([row({ ...quoted, registry: 'policy.gates.ladder' })], ctx),
    [{ code: 'row', subject: 'registry-ambiguous:policy.gates.ladder' }]);
});

test("scope: 'file' searches the whole document, anchors do not", (t) => {
  const ctx = fixture(t);
  const bare = { kind: 'names', registry: 'policy.gates.ladder', element: '{x} appears here too' } as const;
  assert.deepEqual(runMirrors([row({ ...bare, scope: 'file' })], ctx), [{ code: 'row', subject: 'design' }]);
  assert.deepEqual(runMirrors([row({ ...bare })], ctx),
    [{ code: 'row', subject: 'discovery' }, { code: 'row', subject: 'design' }]);
});

test('a case-insensitive row reads prose that renders the ids differently', (t) => {
  const ctx = fixture(t, { 'doc.md': '## Vocabulary\n\n| Discovery | first |\n| Design | second |\n' });
  const titled = { kind: 'names', element: '^\\| {x} \\|' } as const;
  assert.deepEqual(runMirrors([row({ ...titled, ignoreCase: true })], ctx), []);
  assert.equal(runMirrors([row({ ...titled })], ctx).length, 2);
});

test('sliceSection ends at the next heading and distinguishes absent from empty', () => {
  assert.equal(sliceSection(DOC, '## Numbers'), '\nCap concurrency at ~6 agents per wave.\n');
  assert.equal(sliceSection(DOC, '## Empty'), '');
  assert.equal(sliceSection(DOC, '## Missing'), undefined);
  // The anchor matches the whole line, so a heading that merely starts with it
  // is a different section.
  assert.equal(sliceSection(DOC, '## Vocab'), undefined);
});

test('resolveRegistryPath walks arrays, id selectors and scalar leaves', (t) => {
  const { root } = fixture(t);
  assert.deepEqual(resolveRegistryPath(root, 'policy.gates.ladder'), ['discovery', 'design']);
  assert.deepEqual(resolveRegistryPath(root, 'policy.parallelism.wave_concurrency_cap'), ['6']);
  assert.deepEqual(resolveRegistryPath(root, 'policy.pairs[].value'), ['alpha', 'beta']);
  assert.deepEqual(resolveRegistryPath(root, 'policy.pairs[id=b].value'), ['beta']);
  assert.deepEqual(resolveRegistryPath(root, 'policy.empty_list'), []);
  assert.throws(() => resolveRegistryPath(root, 'policy.pairs[id=zz].value'), KernelError);
  assert.throws(() => resolveRegistryPath(root, 'policy.gates'), KernelError);
  assert.throws(() => resolveRegistryPath(root, 'policy.nope'), KernelError);
  assert.throws(() => resolveRegistryPath(root, 'routing.precedence'), KernelError);
});
