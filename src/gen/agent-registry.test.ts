import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo } from '../io';
import { KernelError } from '../lib/json';
import { loadCapabilities, type CapabilitiesRegistry } from '../registry/capabilities';
import { loadModels, type ModelsRegistry } from '../registry/models';
import { resolveRoot } from '../registry/paths';
import { relocatedRoot, tempRoot } from '../testing/harness';
import { buildAgentRegistry, generateAgentRegistry, type AgentFile, type AgentRegistryEntry } from './agent-registry';

// The real registries, so the tier vocabulary a FAIL message quotes is the one
// shipped rather than a fixture that could drift away from it.
const checkout = resolveRoot(process.env, __dirname);
const models: ModelsRegistry = loadModels(checkout);
const capabilities: CapabilitiesRegistry = loadCapabilities(checkout);

// The fixture the bash suite plants, one field set per case. Mirrors
// scripts/test-gen-agent-registry.sh so the two suites cover the same edges.
function fixture(frontmatter: string): AgentFile[] {
  return [{ path: '/tmp/agents/zz-fixture.md', text: `---\n${frontmatter}\n---\nbody\n` }];
}

function onlyEntry(files: AgentFile[]): AgentRegistryEntry {
  const document = buildAgentRegistry(files, models, capabilities);
  const entry = document.agents[0];
  assert.ok(entry !== undefined, 'expected exactly one entry');
  return entry;
}

test('an agent with no tools: line produces an empty array rather than crashing', () => {
  const entry = onlyEntry(fixture('name: zz-fixture\ndescription: throwaway.\nmodel: opus\ntier: build'));
  assert.deepEqual(entry.tools, []);
});

test('a frontmatter line with no space after the colon still strips the field name', () => {
  const entry = onlyEntry(fixture('name: zz-fixture\ndescription: throwaway.\ntools: Read\nmodel:opus\ntier:build'));
  assert.equal(entry.model, 'opus');
  assert.equal(entry.model_tier, 'build');
});

test('a trailing comma in tools: does not produce a spurious empty entry', () => {
  const entry = onlyEntry(fixture('name: zz-fixture\ndescription: throwaway.\ntools: Read, Grep,\nmodel: opus\ntier: build'));
  assert.deepEqual(entry.tools, ['Read', 'Grep']);
});

test('model_tier is taken from tier: frontmatter, not reverse-derived from the model', () => {
  // build and design both bind opus, so a derived tier could not tell these apart.
  const entry = onlyEntry(fixture('name: zz-fixture\ndescription: throwaway.\ntools: Read\nmodel: opus\ntier: design'));
  assert.equal(entry.model_tier, 'design');
});

test('alias is null when the frontmatter declares none, and the string when it does', () => {
  const absent = onlyEntry(fixture('name: zz-fixture\ndescription: throwaway.\nmodel: opus\ntier: build'));
  assert.equal(absent.alias, null);
  const present = onlyEntry(fixture('name: zz-fixture\ndescription: throwaway. Alias: zzf.\nmodel: opus\ntier: build'));
  assert.equal(present.alias, 'zzf');
});

test('a file without a name: is skipped silently rather than failing the run', () => {
  const document = buildAgentRegistry(fixture('description: not an agent definition.'), models, capabilities);
  assert.deepEqual(document.agents, []);
});

test('an agent with no tier: frontmatter fails, naming every declarable tier', () => {
  assert.throws(
    () => buildAgentRegistry(fixture('name: zz-fixture\ndescription: throwaway.\ntools: Read\nmodel: opus'), models, capabilities),
    (error: unknown) => {
      assert.ok(error instanceof KernelError);
      assert.equal(
        error.message,
        "FAIL: /tmp/agents/zz-fixture.md has no 'tier:' frontmatter — the tier cannot be derived from the model (two tiers may share a binding, registries/models.json). Declare one of: most-capable, design, build, cheap.",
      );
      return true;
    },
  );
});

test('an unknown tier id fails loudly', () => {
  assert.throws(
    () => buildAgentRegistry(fixture('name: zz-fixture\ndescription: throwaway.\ntools: Read\nmodel: opus\ntier: turbo'), models, capabilities),
    (error: unknown) => {
      assert.ok(error instanceof KernelError);
      assert.equal(error.message, "FAIL: /tmp/agents/zz-fixture.md declares unknown tier 'turbo' — not a tier id in registries/models.json.");
      return true;
    },
  );
});

test('a tier whose models.json binding disagrees with model: fails loudly', () => {
  assert.throws(
    () => buildAgentRegistry(fixture('name: zz-fixture\ndescription: throwaway.\ntools: Read\nmodel: haiku\ntier: design'), models, capabilities),
    (error: unknown) => {
      assert.ok(error instanceof KernelError);
      assert.equal(
        error.message,
        "FAIL: /tmp/agents/zz-fixture.md declares tier 'design' (binds model 'opus' in registries/models.json) but model 'haiku' — fix the frontmatter or rebind the tier.",
      );
      return true;
    },
  );
});

test('capability_ids is the back-reference, in capabilities.json order', () => {
  // A synthetic registry rather than the shipped one: no shipped agent holds two
  // capabilities, so only a fixture can pin the ORDER the back-reference keeps.
  const twoPerAgent: CapabilitiesRegistry = {
    version: '1.1.0',
    model_tiers: ['build'],
    capabilities: [
      { id: 'validate', title: 'second in file order', agent: 'zz-fixture', model_tier: 'build', risk_floor: 'low' },
      { id: 'document', title: 'other agent', agent: 'someone-else', model_tier: 'build', risk_floor: 'low' },
      { id: 'implement', title: 'first in file order', agent: 'zz-fixture', model_tier: 'build', risk_floor: 'medium' },
    ],
  };
  const document = buildAgentRegistry(fixture('name: zz-fixture\ndescription: throwaway.\nmodel: opus\ntier: build'), models, twoPerAgent);
  assert.deepEqual(document.agents[0]?.capability_ids, ['validate', 'implement']);
});

test('the shipped back-reference resolves for an agent that holds one capability', () => {
  const entry = onlyEntry(fixture('name: security-reviewer\ndescription: throwaway.\nmodel: opus\ntier: design'));
  assert.deepEqual(entry.capability_ids, ['security-review']);
});

test('agents are sorted by name in code-point order, not by input order', () => {
  const files: AgentFile[] = [
    { path: '/tmp/agents/b.md', text: '---\nname: zebra\ndescription: b.\nmodel: opus\ntier: build\n---\n' },
    { path: '/tmp/agents/a.md', text: '---\nname: Zebra\ndescription: a.\nmodel: opus\ntier: build\n---\n' },
    { path: '/tmp/agents/c.md', text: '---\nname: alpha\ndescription: c.\nmodel: opus\ntier: build\n---\n' },
  ];
  // 'Z' (0x5A) before 'a' (0x61) before 'z' (0x7A): a locale collation would
  // fold case and answer alpha, Zebra, zebra instead.
  assert.deepEqual(buildAgentRegistry(files, models, capabilities).agents.map((agent) => agent.name), ['Zebra', 'alpha', 'zebra']);
});

test('the document envelope is the version and description the committed file carries', () => {
  const document = buildAgentRegistry([], models, capabilities);
  assert.equal(document.version, '1.0.0');
  assert.equal(
    document.description,
    'Generated from agents/*.md frontmatter by scripts/gen-agent-registry.sh — do not hand-edit. capability_ids is a back-reference from registries/capabilities.json.',
  );
  assert.deepEqual(document.agents, []);
});

// ------------------------------------------------------------- the I/O half

// relocatedRoot copies registries/ into a temp tree; agents/ is planted here and
// the copied agents.json removed, so "wrote the file" is not satisfied by the
// copy that came along for the ride.
function generatorRoot(t: TestContext, agents: Record<string, string> | null): string {
  const root = relocatedRoot(tempRoot(t));
  rmSync(join(root, 'registries', 'agents.json'), { force: true });
  if (agents !== null) {
    mkdirSync(join(root, 'agents'));
    for (const [file, text] of Object.entries(agents)) writeFileSync(join(root, 'agents', file), text);
  }
  return root;
}

test('a fresh run writes the document with a trailing newline and reports the count', (t) => {
  const root = generatorRoot(t, {
    'zz-fixture.md': '---\nname: zz-fixture\ndescription: throwaway.\ntools: Read, Grep\nmodel: opus\ntier: build\n---\nbody\n',
    'not-an-agent.md': '---\ndescription: no name field.\n---\nbody\n',
  });
  const outFile = join(root, 'registries', 'agents.json');
  const io = memoryIo();

  assert.equal(generateAgentRegistry(root, io), 0);
  assert.deepEqual(io.stdout, [`Wrote 1 agents to ${outFile}\n`]);
  assert.deepEqual(io.stderr, []);

  const written = readFileSync(outFile, 'utf8');
  assert.ok(written.endsWith('\n'));
  const expected = buildAgentRegistry(
    [{ path: join(root, 'agents', 'zz-fixture.md'), text: readFileSync(join(root, 'agents', 'zz-fixture.md'), 'utf8') }],
    models,
    capabilities,
  );
  assert.equal(written, `${JSON.stringify(expected, null, 2)}\n`);
});

test('a tree with no agents dir exits 1 and names the path', (t) => {
  const root = generatorRoot(t, null);
  const io = memoryIo();

  assert.equal(generateAgentRegistry(root, io), 1);
  assert.deepEqual(io.stderr, [`No agents dir at ${join(root, 'agents')}\n`]);
  assert.deepEqual(io.stdout, []);
});

test('a tier failure exits 1, writes nothing, and prints the FAIL line byte-exact', (t) => {
  const root = generatorRoot(t, {
    'zz-fixture.md': '---\nname: zz-fixture\ndescription: throwaway.\ntools: Read\nmodel: opus\ntier: turbo\n---\nbody\n',
  });
  const outFile = join(root, 'registries', 'agents.json');
  const io = memoryIo();

  assert.equal(generateAgentRegistry(root, io), 1);
  assert.equal(existsSync(outFile), false);
  assert.deepEqual(io.stderr, [
    `FAIL: ${join(root, 'agents', 'zz-fixture.md')} declares unknown tier 'turbo' — not a tier id in registries/models.json.\n`,
  ]);
  assert.deepEqual(io.stdout, []);
});

test('a tree with no capabilities registry exits 1 before it reads any agent', (t) => {
  const root = generatorRoot(t, { 'zz-fixture.md': '---\nname: zz-fixture\ndescription: throwaway.\nmodel: opus\n---\nbody\n' });
  rmSync(join(root, 'registries', 'capabilities.json'));
  const io = memoryIo();

  assert.equal(generateAgentRegistry(root, io), 1);
  assert.deepEqual(io.stderr, [`No capabilities registry at ${join(root, 'registries', 'capabilities.json')}\n`]);
});

test('a tree with no models registry exits 1 and names that path', (t) => {
  const root = generatorRoot(t, { 'zz-fixture.md': '---\nname: zz-fixture\ndescription: throwaway.\nmodel: opus\n---\nbody\n' });
  rmSync(join(root, 'registries', 'models.json'));
  const io = memoryIo();

  assert.equal(generateAgentRegistry(root, io), 1);
  assert.deepEqual(io.stderr, [`No models registry at ${join(root, 'registries', 'models.json')}\n`]);
});
