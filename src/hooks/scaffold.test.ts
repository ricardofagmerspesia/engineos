import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveRoot } from '../registry/paths';
import { type ManifestEntry, loadLayoutManifest, scaffoldLayout } from './scaffold';

const repoRoot = resolveRoot({}, __dirname);

// The scaffolder is exercised against a fake EngineOS root so a test manifest can
// name exactly the entries a case needs; the real registry is asserted separately.
interface Fixture {
  project: string;
  engineos: string;
}

function withFixture(body: (fx: Fixture) => void): void {
  const base = mkdtempSync(join(tmpdir(), 'engineos-scaffold-'));
  try {
    const project = join(base, 'project');
    const engineos = join(base, 'engineos');
    mkdirSync(project);
    mkdirSync(join(engineos, 'templates', 'project-layout'), { recursive: true });
    mkdirSync(join(engineos, 'seeds'), { recursive: true });
    writeFileSync(join(engineos, 'templates', 'project-layout', 'specs-README.md'), 'TEMPLATE\n');
    writeFileSync(join(engineos, 'seeds', 'changes-template.md'), 'IN-REPO\n');
    body({ project, engineos });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

const MANIFEST: ManifestEntry[] = [
  { dir: 'docs/specs', seeds: [{ src: 'specs-README.md', dest: 'README.md' }] },
  { dir: '.engineos/changes', seeds: [{ src: '@seeds/changes-template.md', dest: '_template.md' }] },
];

test('the shipped registry declares the six standard dirs in manifest order', () => {
  const manifest = loadLayoutManifest(repoRoot);
  assert.deepEqual(
    manifest.map((entry) => entry.dir),
    ['.engineos/changes', '.engineos/archived', '.engineos/memory', 'docs/specs', 'docs/prds', 'docs/rules'],
  );
  assert.deepEqual(manifest[3]?.seeds, [{ src: 'specs-README.md', dest: 'README.md' }]);
});

test('a malformed manifest is refused by name, not defaulted away', () => {
  withFixture(({ engineos }) => {
    mkdirSync(join(engineos, 'registries'));
    writeFileSync(join(engineos, 'registries', 'layout-manifest.json'), '{"entries":[{"dir":1}]}');
    assert.throws(
      () => loadLayoutManifest(engineos),
      /registries\/layout-manifest\.json: \.entries\[0\]\.dir must be a string/,
    );
  });
});

test('every missing dir is created and seeded, in manifest order', () => {
  withFixture(({ project, engineos }) => {
    const created = scaffoldLayout(project, engineos, MANIFEST);
    assert.deepEqual(created, ['docs/specs', '.engineos/changes']);
    assert.equal(readFileSync(join(project, 'docs', 'specs', 'README.md'), 'utf8'), 'TEMPLATE\n');
    // A seed src starting with '@' is repo-relative, not a template basename.
    assert.equal(readFileSync(join(project, '.engineos', 'changes', '_template.md'), 'utf8'), 'IN-REPO\n');
  });
});

test('a second run creates nothing and overwrites nothing', () => {
  withFixture(({ project, engineos }) => {
    scaffoldLayout(project, engineos, MANIFEST);
    writeFileSync(join(project, 'docs', 'specs', 'README.md'), 'KEEP\n');
    assert.deepEqual(scaffoldLayout(project, engineos, MANIFEST), []);
    assert.equal(readFileSync(join(project, 'docs', 'specs', 'README.md'), 'utf8'), 'KEEP\n');
  });
});

test('a dangling symlink at a destination is skipped, never written through', () => {
  withFixture(({ project, engineos }) => {
    const outside = mkdtempSync(join(tmpdir(), 'engineos-outside-'));
    try {
      mkdirSync(join(project, 'docs', 'specs'), { recursive: true });
      symlinkSync(join(outside, 'pwned.md'), join(project, 'docs', 'specs', 'README.md'));
      scaffoldLayout(project, engineos, MANIFEST);
      assert.equal(existsSync(join(outside, 'pwned.md')), false);
      assert.equal(lstatSync(join(project, 'docs', 'specs', 'README.md')).isSymbolicLink(), true);
      // One refused destination must not abort the rest of the scaffold.
      assert.equal(existsSync(join(project, '.engineos', 'changes', '_template.md')), true);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('a live symlink at a destination is skipped too', () => {
  withFixture(({ project, engineos }) => {
    const outside = mkdtempSync(join(tmpdir(), 'engineos-outside-'));
    try {
      writeFileSync(join(outside, 'existing.md'), 'THEIRS\n');
      mkdirSync(join(project, 'docs', 'specs'), { recursive: true });
      symlinkSync(join(outside, 'existing.md'), join(project, 'docs', 'specs', 'README.md'));
      scaffoldLayout(project, engineos, MANIFEST);
      assert.equal(readFileSync(join(outside, 'existing.md'), 'utf8'), 'THEIRS\n');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('a symlinked directory component is refused, not followed', () => {
  withFixture(({ project, engineos }) => {
    const outside = mkdtempSync(join(tmpdir(), 'engineos-outside-'));
    try {
      mkdirSync(join(outside, 'docs'));
      symlinkSync(join(outside, 'docs'), join(project, 'docs'));
      const created = scaffoldLayout(project, engineos, MANIFEST);
      assert.equal(existsSync(join(outside, 'docs', 'specs')), false);
      assert.deepEqual(created, ['.engineos/changes']);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('a non-directory occupying a component is refused', () => {
  withFixture(({ project, engineos }) => {
    writeFileSync(join(project, 'docs'), 'not a dir\n');
    assert.deepEqual(scaffoldLayout(project, engineos, MANIFEST), ['.engineos/changes']);
  });
});

test('a manifest dir containing .. creates nothing', () => {
  withFixture(({ project, engineos }) => {
    const created = scaffoldLayout(project, engineos, [{ dir: '../escaped', seeds: [] }]);
    assert.deepEqual(created, []);
    assert.equal(existsSync(join(project, '..', 'escaped')), false);
  });
});

test('a seed name that is not a plain file name is refused', () => {
  withFixture(({ project, engineos }) => {
    scaffoldLayout(project, engineos, [
      { dir: 'docs', seeds: [{ src: 'specs-README.md', dest: '../escaped.md' }] },
    ]);
    assert.equal(existsSync(join(project, 'escaped.md')), false);
  });
});

test('a project root that does not exist is a silent no-op', () => {
  withFixture(({ project, engineos }) => {
    assert.deepEqual(scaffoldLayout(join(project, 'missing'), engineos, MANIFEST), []);
  });
});
