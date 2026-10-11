import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryIo, type Io } from '../io';
import { parseIntents, type IntentsRegistry } from '../registry/intents';
import { runInProcess, tempRoot } from '../testing/harness';
import { runGen } from './cli';
import {
  ROUTER_TABLE_BEGIN,
  ROUTER_TABLE_END,
  generateRouterTable,
  renderRouterTable,
  routerTableRegion,
  withRouterTable,
} from './router-table';

const HEADER = '| Intent (signals) | Load |';
const SEPARATOR = '|---|---|';

interface IntentFixture {
  id: string;
  title?: string;
  signals?: string[];
  rules?: string[];
  skills?: string[];
  agents?: string[];
  commands?: string[];
  mcp?: string[];
  note?: string;
  router_row?: { intent: string; load: string };
  phrases?: { text: string; weight: number }[];
}

function intentRow(fixture: IntentFixture): Record<string, unknown> {
  return { title: `${fixture.id} work`, signals: [`${fixture.id} signal`], ...fixture };
}

function registryOf(rows: readonly IntentFixture[]): IntentsRegistry {
  return parseIntents({ version: '2.0.0', intents: rows.map(intentRow) });
}

function capture(): { io: Io; stdout: string[]; stderr: string[] } {
  const io = memoryIo({});
  return { io, stdout: io.stdout, stderr: io.stderr };
}

interface TreeOptions {
  rows?: readonly IntentFixture[];
  files?: Readonly<Record<string, string>>;
}

const DEFAULT_ROWS: readonly IntentFixture[] = [
  { id: 'backend', router_row: { intent: 'Backend work (API)', load: '`rules/backend.md`' } },
  { id: 'bug', title: 'Bug', skills: ['superpowers:systematic-debugging'] },
];

function documentWithRegion(region: readonly string[]): string {
  return ['# Project', '', 'Prose above.', ROUTER_TABLE_BEGIN, ...region, ROUTER_TABLE_END, '', 'Prose below.', ''].join('\n');
}

function tree(t: TestContext, options: TreeOptions = {}): string {
  const root = tempRoot(t);
  mkdirSync(join(root, 'registries'), { recursive: true });
  writeFileSync(
    join(root, 'registries', 'intents.json'),
    JSON.stringify({ version: '2.0.0', intents: (options.rows ?? DEFAULT_ROWS).map(intentRow) }, null, 2),
  );
  const files = options.files ?? { 'CLAUDE.md': documentWithRegion(['stale']), 'AGENTS.md': documentWithRegion(['stale']) };
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  return root;
}

function read(root: string, name: string): string {
  return readFileSync(join(root, name), 'utf8');
}

// ------------------------------------------------------------------ renderRouterTable

test('the rendered table opens with the header and separator rows', () => {
  const table = renderRouterTable(registryOf(DEFAULT_ROWS));
  assert.deepEqual(table.slice(0, 2), [HEADER, SEPARATOR]);
  assert.equal(table.length, 2 + DEFAULT_ROWS.length);
});

test('a declared router_row supplies both cells verbatim', () => {
  const table = renderRouterTable(registryOf([{ id: 'backend', router_row: { intent: 'Backend | API', load: 'agent `x`' } }]));
  assert.equal(table[2], '| Backend | API | agent `x` |');
});

test('a derived intent cell quotes the declared phrases after the title', () => {
  const table = renderRouterTable(
    registryOf([
      {
        id: 'adr',
        title: 'Architecture decision',
        phrases: [
          { text: 'should we use', weight: 1 },
          { text: 'how should we structure', weight: 2 },
        ],
        skills: ['adr'],
      },
    ]),
  );
  assert.equal(table[2], '| Architecture decision ("should we use", "how should we structure") | skill `adr` |');
});

test('a row without declared phrases quotes its signals, since they are its phrases', () => {
  const table = renderRouterTable(registryOf([{ id: 'refactor', title: 'Refactor', signals: ['refactor', 'clean up'], rules: ['architecture'] }]));
  assert.equal(table[2], '| Refactor ("refactor", "clean up") | `rules/architecture.md` |');
});

test('the derived load cell orders rules, skills, commands, agents and MCP servers, then the note', () => {
  const table = renderRouterTable(
    registryOf([
      {
        id: 'backend',
        title: 'Backend',
        signals: ['api'],
        rules: ['architecture', 'backend'],
        skills: ['nestjs-patterns'],
        commands: ['new-feature', '/engineos:implement', '/audit'],
        agents: ['backend-coordinator'],
        mcp: ['nestjs'],
        note: 'codegen first',
      },
    ]),
  );
  assert.equal(
    table[2],
    '| Backend ("api") | `rules/architecture.md` + `rules/backend.md`; skill `nestjs-patterns`; `/engineos:new-feature`; `/engineos:implement`; `/engineos:audit`; agent `backend-coordinator`; nestjs MCP — codegen first |',
  );
});

test('a row with nothing to load shows its title in the load cell', () => {
  const table = renderRouterTable(registryOf([{ id: 'empty', title: 'Empty row', signals: ['nothing'] }]));
  assert.equal(table[2], '| Empty row ("nothing") | Empty row |');
});

test('a raw pipe in a derived cell is escaped and an escaped one is left alone', () => {
  const table = renderRouterTable(registryOf([{ id: 'pipes', title: 'A | B', signals: ['x'], skills: ['s'], note: 'one \\| two | three' }]));
  assert.equal(table[2], '| A \\| B ("x") | skill `s` — one \\| two \\| three |');
});

test('the folded android-release row emits no table row of its own', () => {
  const table = renderRouterTable(
    registryOf([
      { id: 'ios-release', router_row: { intent: 'Mobile store release', load: 'agents `ios-builder`, `android-builder`' } },
      { id: 'android-release', title: 'Android release', signals: ['play store'] },
    ]),
  );
  assert.deepEqual(table, [HEADER, SEPARATOR, '| Mobile store release | agents `ios-builder`, `android-builder` |']);
});

test('rows render in registry order', () => {
  const table = renderRouterTable(registryOf([{ id: 'zeta' }, { id: 'alpha' }]));
  assert.ok(table[2]?.startsWith('| zeta work'));
  assert.ok(table[3]?.startsWith('| alpha work'));
});

// ------------------------------------------------------------------ routerTableRegion

test('a text without either marker has no region', () => {
  assert.deepEqual(routerTableRegion('# nothing here\n'), { kind: 'missing' });
});

test('the region is the lines strictly between the two markers', () => {
  const region = routerTableRegion(documentWithRegion(['one', 'two']));
  assert.deepEqual(region, { kind: 'found', start: 3, end: 6, lines: ['one', 'two'] });
});

test('a lone begin marker is malformed', () => {
  const region = routerTableRegion(`${ROUTER_TABLE_BEGIN}\n| a | b |\n`);
  assert.deepEqual(region, { kind: 'malformed', problem: 'each marker must appear exactly once' });
});

test('a duplicated end marker is malformed', () => {
  const region = routerTableRegion([ROUTER_TABLE_BEGIN, ROUTER_TABLE_END, ROUTER_TABLE_END].join('\n'));
  assert.deepEqual(region, { kind: 'malformed', problem: 'each marker must appear exactly once' });
});

test('an end marker before the begin marker is malformed', () => {
  const region = routerTableRegion([ROUTER_TABLE_END, 'x', ROUTER_TABLE_BEGIN].join('\n'));
  assert.deepEqual(region, { kind: 'malformed', problem: 'the end marker precedes the begin marker' });
});

test('a marker sharing its line with other text is not a marker', () => {
  const region = routerTableRegion(`see ${ROUTER_TABLE_BEGIN} and ${ROUTER_TABLE_END}\n`);
  assert.deepEqual(region, { kind: 'missing' });
});

// ------------------------------------------------------------------ withRouterTable

test('only the region is replaced; the prose around it is kept byte for byte', () => {
  const next = withRouterTable(documentWithRegion(['old row']), ['new 1', 'new 2']);
  assert.equal(next, documentWithRegion(['new 1', 'new 2']));
});

test('a text without a usable region yields null rather than a guess', () => {
  assert.equal(withRouterTable('# no markers\n', ['row']), null);
  assert.equal(withRouterTable(`${ROUTER_TABLE_BEGIN}\n`, ['row']), null);
});

// ------------------------------------------------------------------ generateRouterTable

test('generate rewrites both files and reports the row count', (t) => {
  const root = tree(t);
  const { io, stdout, stderr } = capture();
  assert.equal(generateRouterTable(root, io), 0);
  assert.deepEqual(stderr, []);
  assert.deepEqual(stdout, ['router-table: CLAUDE.md rewritten (2 rows)\n', 'router-table: AGENTS.md rewritten (2 rows)\n']);
  const expected = documentWithRegion(renderRouterTable(registryOf(DEFAULT_ROWS)));
  assert.equal(read(root, 'CLAUDE.md'), expected);
  assert.equal(read(root, 'AGENTS.md'), expected);
});

test('a second run writes nothing and reports both files up to date', (t) => {
  const root = tree(t);
  assert.equal(generateRouterTable(root, capture().io), 0);
  const before = read(root, 'CLAUDE.md');
  const { io, stdout } = capture();
  assert.equal(generateRouterTable(root, io), 0);
  assert.deepEqual(stdout, ['router-table: CLAUDE.md up to date\n', 'router-table: AGENTS.md up to date\n']);
  assert.equal(read(root, 'CLAUDE.md'), before);
});

test('a missing file is skipped while the other is still rewritten', (t) => {
  const root = tree(t, { files: { 'CLAUDE.md': documentWithRegion([]) } });
  const { io, stdout, stderr } = capture();
  assert.equal(generateRouterTable(root, io), 0);
  assert.deepEqual(stderr, ['router-table: AGENTS.md not found — skipped\n']);
  assert.deepEqual(stdout, ['router-table: CLAUDE.md rewritten (2 rows)\n']);
});

test('a file without markers is left untouched and reported', (t) => {
  const plain = '# Agents\n\nNo table here.\n';
  const root = tree(t, { files: { 'CLAUDE.md': documentWithRegion([]), 'AGENTS.md': plain } });
  const { io, stderr } = capture();
  assert.equal(generateRouterTable(root, io), 0);
  assert.deepEqual(stderr, ['router-table: AGENTS.md carries no router-table markers — left untouched\n']);
  assert.equal(read(root, 'AGENTS.md'), plain);
});

test('a file with malformed markers is left untouched with the problem named', (t) => {
  const broken = `${ROUTER_TABLE_BEGIN}\nrow\n${ROUTER_TABLE_BEGIN}\n${ROUTER_TABLE_END}\n`;
  const root = tree(t, { files: { 'CLAUDE.md': documentWithRegion([]), 'AGENTS.md': broken } });
  const { io, stderr } = capture();
  assert.equal(generateRouterTable(root, io), 0);
  assert.deepEqual(stderr, [
    'router-table: AGENTS.md has malformed router-table markers (each marker must appear exactly once) — left untouched\n',
  ]);
  assert.equal(read(root, 'AGENTS.md'), broken);
});

test('no file carrying the markers is a failure, not a clean run', (t) => {
  const root = tree(t, { files: { 'CLAUDE.md': '# none\n' } });
  const { io, stderr } = capture();
  assert.equal(generateRouterTable(root, io), 1);
  assert.equal(stderr[stderr.length - 1], 'no file carries the router-table markers\n');
});

test('an intents registry the strict loader refuses fails with its message and writes nothing', (t) => {
  const root = tree(t);
  writeFileSync(join(root, 'registries', 'intents.json'), JSON.stringify({ version: '2.0.0', intents: [] }));
  const before = read(root, 'CLAUDE.md');
  const { io, stdout, stderr } = capture();
  assert.equal(generateRouterTable(root, io), 1);
  assert.deepEqual(stdout, []);
  assert.deepEqual(stderr, ['registries/intents.json: .intents must not be empty\n']);
  assert.equal(read(root, 'CLAUDE.md'), before);
});

test('gen router-table generates into ENGINEOS_ROOT', (t) => {
  const root = tree(t);
  const result = runInProcess(runGen, ['router-table'], { env: { ENGINEOS_ROOT: root } });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'router-table: CLAUDE.md rewritten (2 rows)\nrouter-table: AGENTS.md rewritten (2 rows)\n');
  assert.ok(read(root, 'CLAUDE.md').includes(`${ROUTER_TABLE_BEGIN}\n${HEADER}\n${SEPARATOR}\n`));
});
