import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo, type Io } from '../io';
import { runInProcess, tempRoot } from '../testing/harness';
import { MARKER, generateAgentCommands } from './agent-commands';
import { runGen } from './cli';

interface Capture { io: Io; stdout: string[]; stderr: string[] }

function capture(): Capture {
  const io = memoryIo({});
  return { io, stdout: io.stdout, stderr: io.stderr };
}

// A root with agents/<file> for each entry. The out dir is created by the generator.
function fixture(t: TestContext, agents: Record<string, string>): string {
  const root = tempRoot(t);
  mkdirSync(join(root, 'agents'), { recursive: true });
  for (const [file, text] of Object.entries(agents)) writeFileSync(join(root, 'agents', file), text);
  return root;
}

function outDir(root: string): string {
  return join(root, 'commands', 'agents');
}

function command(root: string, name: string): string {
  return readFileSync(join(outDir(root), `${name}.md`), 'utf8');
}

function writeCommand(root: string, name: string, text: string): void {
  mkdirSync(outDir(root), { recursive: true });
  writeFileSync(join(outDir(root), `${name}.md`), text);
}

const CRITIC = `---
name: critic
description: Adversarial correctness review. Alias: vera (invocable by this name).
model: opus
---
`;

// Written out by hand rather than reusing the generator's template: this is the
// public artifact, and a test that renders it the same way the code does would
// agree with any drift.
const CRITIC_COMMAND = `---
description: Invoke the critic agent (alias vera).
argument-hint: [task or question for the agent]
allowed-tools: Task
---
${MARKER}

Dispatch the \`critic\` agent (alias \`vera\`) via the Task tool, passing
\`$ARGUMENTS\` as its prompt. If \`$ARGUMENTS\` is empty, ask the user what they
want the agent to do before dispatching.

The agent follows its own mode and output rules (it self-infers AUDIT vs
IMPLEMENT where applicable). Relay its report back verbatim; do not re-do its
work yourself.
`;

test('a fresh run writes one command per name and per alias', (t) => {
  const root = fixture(t, { 'critic.md': CRITIC });
  const { io, stdout, stderr } = capture();

  assert.equal(generateAgentCommands(root, io), 0);

  assert.equal(command(root, 'critic'), CRITIC_COMMAND);
  assert.equal(command(root, 'vera'), CRITIC_COMMAND);
  assert.deepEqual(stderr, []);
  assert.equal(stdout.join(''), `Done in ${outDir(root)} — generated: 2, preserved: 0, removed stale: 0, kept orphaned customized: 0\n`);
});

test('an agent with no alias gets one command and no alias suffix', (t) => {
  const root = fixture(t, { 'router.md': '---\nname: router\n---\n' });
  const { io } = capture();

  assert.equal(generateAgentCommands(root, io), 0);

  assert.equal(
    command(root, 'router'),
    `---
description: Invoke the router agent.
argument-hint: [task or question for the agent]
allowed-tools: Task
---
${MARKER}

Dispatch the \`router\` agent via the Task tool, passing
\`$ARGUMENTS\` as its prompt. If \`$ARGUMENTS\` is empty, ask the user what they
want the agent to do before dispatching.

The agent follows its own mode and output rules (it self-infers AUDIT vs
IMPLEMENT where applicable). Relay its report back verbatim; do not re-do its
work yourself.
`,
  );
});

test('an alias equal to the name emits one command, not two', (t) => {
  const root = fixture(t, { 'qa.md': '---\nname: qa\ndescription: Alias: qa (invocable by this name).\n---\n' });
  const { io, stdout } = capture();

  assert.equal(generateAgentCommands(root, io), 0);

  assert.match(stdout.join(''), /generated: 1,/);
  assert.equal(existsSync(join(outDir(root), 'qa.md')), true);
});

test('a file without the marker is preserved and reported', (t) => {
  const root = fixture(t, { 'critic.md': CRITIC });
  writeCommand(root, 'critic', 'hand written, no marker\n');
  const { io, stdout, stderr } = capture();

  assert.equal(generateAgentCommands(root, io), 0);

  assert.equal(command(root, 'critic'), 'hand written, no marker\n');
  assert.deepEqual(stderr, ['preserved (customized): critic.md\n']);
  assert.equal(stdout.join(''), `Done in ${outDir(root)} — generated: 1, preserved: 1, removed stale: 0, kept orphaned customized: 0\n`);
});

test('a file carrying the marker is regenerated', (t) => {
  const root = fixture(t, { 'critic.md': CRITIC });
  writeCommand(root, 'critic', `stale body\n${MARKER}\n`);
  const { io, stderr } = capture();

  assert.equal(generateAgentCommands(root, io), 0);

  assert.equal(command(root, 'critic'), CRITIC_COMMAND);
  assert.deepEqual(stderr, []);
});

test('a stale generated command is removed', (t) => {
  const root = fixture(t, { 'router.md': '---\nname: router\n---\n' });
  writeCommand(root, 'gone', `---\n${MARKER}\n`);
  const { io, stdout, stderr } = capture();

  assert.equal(generateAgentCommands(root, io), 0);

  assert.equal(existsSync(join(outDir(root), 'gone.md')), false);
  assert.deepEqual(stderr, ['removed stale: gone.md\n']);
  assert.equal(stdout.join(''), `Done in ${outDir(root)} — generated: 1, preserved: 0, removed stale: 1, kept orphaned customized: 0\n`);
});

test('a stale customized command is kept and reported', (t) => {
  const root = fixture(t, { 'router.md': '---\nname: router\n---\n' });
  writeCommand(root, 'gone', 'mine now\n');
  const { io, stdout, stderr } = capture();

  assert.equal(generateAgentCommands(root, io), 0);

  assert.equal(command(root, 'gone'), 'mine now\n');
  assert.deepEqual(stderr, ['kept orphaned customized (agent removed/renamed?): gone.md\n']);
  assert.equal(stdout.join(''), `Done in ${outDir(root)} — generated: 1, preserved: 0, removed stale: 0, kept orphaned customized: 1\n`);
});

test('an agent file with no name: line is skipped by absolute path', (t) => {
  const root = fixture(t, { 'broken.md': '---\ndescription: nameless\n---\n' });
  const { io, stdout, stderr } = capture();

  assert.equal(generateAgentCommands(root, io), 0);

  assert.deepEqual(stderr, [`skip (no name): ${join(root, 'agents', 'broken.md')}\n`]);
  assert.equal(stdout.join(''), `Done in ${outDir(root)} — generated: 0, preserved: 0, removed stale: 0, kept orphaned customized: 0\n`);
});

// Nameless files, because the skip line is the only per-file output there is and it
// therefore reports the traversal order directly.
test('agent files are read in code-unit order', (t) => {
  const root = fixture(t, { 'a.md': '---\n---\n', 'B.md': '---\n---\n', 'C.md': '---\n---\n' });
  const { io, stderr } = capture();

  assert.equal(generateAgentCommands(root, io), 0);

  // Upper case sorts before lower case by code unit; a locale-aware comparison
  // would interleave them, so this ordering is the assertion.
  assert.deepEqual(stderr, [
    `skip (no name): ${join(root, 'agents', 'B.md')}\n`,
    `skip (no name): ${join(root, 'agents', 'C.md')}\n`,
    `skip (no name): ${join(root, 'agents', 'a.md')}\n`,
  ]);
});

test('a missing agents dir fails with exit 1', (t) => {
  const root = tempRoot(t);
  const { io, stdout, stderr } = capture();

  assert.equal(generateAgentCommands(root, io), 1);

  assert.deepEqual(stderr, [`No agents dir at ${join(root, 'agents')}\n`]);
  assert.deepEqual(stdout, []);
  assert.equal(existsSync(outDir(root)), false);
});

// bash ran without nullglob, so an empty agents/ left `*.md` unexpanded and the loop
// body reported the literal path as a nameless file. Ported deliberately.
test('an empty agents dir reports the unexpanded glob, as bash did', (t) => {
  const root = fixture(t, {});
  const { io, stdout, stderr } = capture();

  assert.equal(generateAgentCommands(root, io), 0);

  assert.deepEqual(stderr, [`skip (no name): ${join(root, 'agents', '*.md')}\n`]);
  assert.equal(stdout.join(''), `Done in ${outDir(root)} — generated: 0, preserved: 0, removed stale: 0, kept orphaned customized: 0\n`);
});

test('non-markdown and dotfiles are ignored on both sides', (t) => {
  const root = fixture(t, { 'critic.md': CRITIC, 'notes.txt': 'name: ignored\n', '.hidden.md': '---\nname: hidden\n---\n' });
  writeCommand(root, 'keep', 'not markdown either');
  writeFileSync(join(outDir(root), 'keep.txt'), 'ignored');
  const { io, stderr } = capture();

  assert.equal(generateAgentCommands(root, io), 0);

  assert.equal(existsSync(join(outDir(root), 'hidden.md')), false);
  assert.equal(readFileSync(join(outDir(root), 'keep.txt'), 'utf8'), 'ignored');
  assert.deepEqual(stderr, ['kept orphaned customized (agent removed/renamed?): keep.md\n']);
});

test('a second run over its own output changes nothing', (t) => {
  const root = fixture(t, { 'critic.md': CRITIC });
  assert.equal(generateAgentCommands(root, capture().io), 0);
  const { io, stdout, stderr } = capture();

  assert.equal(generateAgentCommands(root, io), 0);

  assert.equal(command(root, 'critic'), CRITIC_COMMAND);
  assert.deepEqual(stderr, []);
  assert.equal(stdout.join(''), `Done in ${outDir(root)} — generated: 2, preserved: 0, removed stale: 0, kept orphaned customized: 0\n`);
});

test('gen refuses an unknown target with the usage line', () => {
  const result = runInProcess(runGen, ['agent-nonsense']);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'usage: engineos gen agent-commands|agent-registry\n');
  assert.equal(result.stdout, '');
});

test('gen with no target refuses the same way', () => {
  const result = runInProcess(runGen, []);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'usage: engineos gen agent-commands|agent-registry\n');
});

test('gen agent-commands generates into ENGINEOS_ROOT', (t) => {
  const root = fixture(t, { 'critic.md': CRITIC });

  const result = runInProcess(runGen, ['agent-commands'], { env: { ENGINEOS_ROOT: root } });

  assert.equal(result.status, 0);
  assert.equal(command(root, 'vera'), CRITIC_COMMAND);
  assert.equal(result.stdout, `Done in ${outDir(root)} — generated: 2, preserved: 0, removed stale: 0, kept orphaned customized: 0\n`);
});
