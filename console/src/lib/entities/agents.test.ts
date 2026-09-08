import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { parseAgents } from './agents.js';

const AGENT = `---
name: backend-coordinator
description: Backend specialist. Alias: borisenko.
alias: borisenko
tools: Read, Grep, Bash, Edit
model: opus
tier: build
---

Loads the nestjs-patterns skill when writing controllers.
`;

const ROUTING = JSON.stringify({
  domains: [
    { id: 'backend', agent: 'backend-coordinator', skills: ['nestjs-patterns'] },
    { id: 'frontend', agent: 'frontend-coordinator', skills: ['react-patterns'] },
  ],
});

const CAPABILITIES = JSON.stringify({
  capabilities: [
    { id: 'author-endpoint', agent: 'backend-coordinator' },
    { id: 'author-screen', agent: 'frontend-coordinator' },
  ],
});

function tree(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'engineos-agents-'));
  mkdirSync(path.join(root, 'agents'), { recursive: true });
  mkdirSync(path.join(root, 'registries'), { recursive: true });
  mkdirSync(path.join(root, 'skills', 'nestjs-patterns'), { recursive: true });
  mkdirSync(path.join(root, 'skills', 'react-patterns'), { recursive: true });
  writeFileSync(path.join(root, 'skills', 'nestjs-patterns', 'SKILL.md'), '---\nname: n\n---\n');
  writeFileSync(path.join(root, 'skills', 'react-patterns', 'SKILL.md'), '---\nname: r\n---\n');
  writeFileSync(path.join(root, 'agents', 'backend-coordinator.md'), AGENT);
  writeFileSync(path.join(root, 'registries', 'routing.json'), ROUTING);
  writeFileSync(path.join(root, 'registries', 'capabilities.json'), CAPABILITIES);
  return root;
}

test('an agent is read from its own frontmatter, including the comma list of tools', () => {
  const root = tree();
  try {
    const [agent] = parseAgents(root);
    assert.ok(agent);
    assert.equal(agent.id, 'backend-coordinator');
    assert.equal(agent.alias, 'borisenko');
    assert.equal(agent.model, 'opus');
    assert.equal(agent.tier, 'build');
    assert.deepEqual(agent.tools, ['Read', 'Grep', 'Bash', 'Edit']);
    assert.equal(agent.status, 'active');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('relations come from the registries and from the agent\'s own prose', () => {
  const root = tree();
  try {
    const [agent] = parseAgents(root);
    assert.ok(agent);
    assert.deepEqual(agent.usesSkills, ['nestjs-patterns']);
    assert.deepEqual(agent.routedDomains, ['backend']);
    assert.deepEqual(agent.capabilityIds, ['author-endpoint']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the alias is read from the "Alias: <slug>" text, the way the registry generator reads it', () => {
  const root = tree();
  try {
    // No `alias:` key anywhere in this repo's agent files — the alias lives at
    // the end of the description. Reading a key would return null for all of
    // them.
    writeFileSync(
      path.join(root, 'agents', 'aliased.md'),
      '---\nname: aliased\ndescription: Frontend specialist. Alias: mariana.\nmodel: opus\ntier: build\n---\n\nbody\n',
    );
    const aliased = parseAgents(root).find((agent) => agent.id === 'aliased');
    assert.equal(aliased?.alias, 'mariana');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an agent with no alias text reports no alias', () => {
  const root = tree();
  try {
    writeFileSync(
      path.join(root, 'agents', 'solo.md'),
      '---\nname: solo\ndescription: Works alone.\nmodel: opus\ntier: build\n---\n\nbody\n',
    );
    const solo = parseAgents(root).find((agent) => agent.id === 'solo');
    assert.ok(solo);
    assert.equal(solo.alias, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('one malformed agent does not take the rest of the directory down with it', () => {
  const root = tree();
  try {
    writeFileSync(path.join(root, 'agents', 'broken.md'), 'no frontmatter here\n');
    const agents = parseAgents(root);
    const broken = agents.find((agent) => agent.id === 'broken');
    assert.ok(broken);
    assert.equal(broken.status, 'error');
    assert.match(broken.parseError ?? '', /frontmatter/);
    assert.equal(agents.find((agent) => agent.id === 'backend-coordinator')?.status, 'active');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
