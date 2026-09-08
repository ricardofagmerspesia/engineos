import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, symlinkSync, writeFileSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { resolveRoot } from '../registry/paths';
import { tempRoot } from '../testing/harness';
import { loadLayoutManifest, scaffoldLayout } from './scaffold';

// Differential test: hooks/scaffold-layout.sh stays on disk as versioned sourced
// surface until 2.0, so the bash and the TypeScript scaffolder must agree on
// every tree they produce — not only on the happy path, but on the three
// refusals the containment guard exists for.
const checkout = resolveRoot({}, __dirname);

const BASH_DRIVER = `set -u
. "$1/hooks/scaffold-layout.sh"
engineos_scaffold_layout "$2" "$3"
`;

// The manifest both scaffolders read, written in each dialect. The '..' dest and
// the nested dir are here rather than in the shipped registry: the shipped one
// has no refusal cases, and this test is about the refusals.
const MANIFEST_JSON = {
  entries: [
    { dir: 'docs/specs', seeds: [{ src: 'specs-README.md', dest: 'README.md' }] },
    { dir: 'nested/deep', seeds: [{ src: 'specs-README.md', dest: '..' }] },
    { dir: '.engineos/changes', seeds: [{ src: '@seeds/in-repo.md', dest: '_template.md' }] },
  ],
};

const MANIFEST_SH = `LAYOUT_MANIFEST=(
  "docs/specs|specs-README.md:README.md"
  "nested/deep|specs-README.md:.."
  ".engineos/changes|@seeds/in-repo.md:_template.md"
)
`;

function hasBash(): boolean {
  return spawnSync('bash', ['-c', 'exit 0'], { encoding: 'utf8' }).status === 0;
}

// A minimal EngineOS root: the real hooks/scaffold-layout.sh is sourced from the
// checkout and given this root as its repo dir, so both scaffolders read the same
// fixture manifest and the same seed files.
function fakeEngineosRoot(base: string): string {
  const root = join(base, 'engineos');
  mkdirSync(join(root, 'hooks'), { recursive: true });
  mkdirSync(join(root, 'registries'), { recursive: true });
  mkdirSync(join(root, 'templates', 'project-layout'), { recursive: true });
  mkdirSync(join(root, 'seeds'), { recursive: true });
  writeFileSync(join(root, 'hooks', 'layout-manifest.sh'), MANIFEST_SH);
  writeFileSync(join(root, 'registries', 'layout-manifest.json'), `${JSON.stringify(MANIFEST_JSON, null, 2)}\n`);
  writeFileSync(join(root, 'templates', 'project-layout', 'specs-README.md'), 'TEMPLATE\n');
  writeFileSync(join(root, 'seeds', 'in-repo.md'), 'IN-REPO\n');
  return root;
}

// One sorted line per entry, typed, so a directory that became a file — or a
// seed written through a link — cannot compare equal to the guarded result.
function listing(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string, prefix: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const kind = entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'dir' : 'file';
      out.push(`${kind} ${rel}`);
      if (kind === 'dir') walk(join(current, entry.name), rel);
    }
  };
  walk(dir, '');
  return out;
}

type Shape = (project: string, outside: string) => void;

interface Outcome {
  created: string[];
  project: string[];
  outside: string[];
}

function bashRun(root: string, base: string, shape: Shape): Outcome {
  const project = join(base, 'bash-project');
  const outside = join(base, 'bash-outside');
  mkdirSync(project, { recursive: true });
  mkdirSync(outside, { recursive: true });
  shape(project, outside);
  const result = spawnSync('bash', ['-c', BASH_DRIVER, 'bash', checkout, project, root], { encoding: 'utf8' });
  assert.equal(result.status, 0, `bash scaffolder exited ${String(result.status)}: ${result.stderr ?? ''}`);
  const stdout = result.stdout ?? '';
  return { created: stdout === '' ? [] : stdout.trimEnd().split('\n'), project: listing(project), outside: listing(outside) };
}

function nodeRun(root: string, base: string, shape: Shape): Outcome {
  const project = join(base, 'node-project');
  const outside = join(base, 'node-outside');
  mkdirSync(project, { recursive: true });
  mkdirSync(outside, { recursive: true });
  shape(project, outside);
  const created = scaffoldLayout(project, root, loadLayoutManifest(root));
  return { created, project: listing(project), outside: listing(outside) };
}

function assertEquivalent(t: TestContext, name: string, shape: Shape): void {
  const base = join(tempRoot(t), name);
  mkdirSync(base, { recursive: true });
  const root = fakeEngineosRoot(base);
  const fromBash = bashRun(root, base, shape);
  const fromNode = nodeRun(root, base, shape);
  assert.deepEqual(fromNode.created, fromBash.created, `${name}: created dirs differ`);
  assert.deepEqual(fromNode.project, fromBash.project, `${name}: resulting tree differs`);
  assert.deepEqual(fromNode.outside, fromBash.outside, `${name}: writes outside the project differ`);
}

test('the bash and TypeScript scaffolders agree on a plain project', (t) => {
  if (!hasBash()) {
    t.skip('bash is not installed');
    return;
  }
  assertEquivalent(t, 'plain', () => undefined);
});

test('the bash and TypeScript scaffolders agree on a symlinked directory component', (t) => {
  if (!hasBash()) {
    t.skip('bash is not installed');
    return;
  }
  assertEquivalent(t, 'symlinked-component', (project, outside) => {
    mkdirSync(join(outside, 'docs'));
    symlinkSync(join(outside, 'docs'), join(project, 'docs'));
  });
});

test('the bash and TypeScript scaffolders agree on a dangling seed destination', (t) => {
  if (!hasBash()) {
    t.skip('bash is not installed');
    return;
  }
  assertEquivalent(t, 'dangling-seed', (project, outside) => {
    mkdirSync(join(project, 'docs', 'specs'), { recursive: true });
    symlinkSync(join(outside, 'pwned.md'), join(project, 'docs', 'specs', 'README.md'));
  });
});

test('the bash and TypeScript scaffolders agree on a file where a dir belongs', (t) => {
  if (!hasBash()) {
    t.skip('bash is not installed');
    return;
  }
  assertEquivalent(t, 'file-in-the-way', (project) => {
    writeFileSync(join(project, 'docs'), 'not a directory\n');
  });
});
