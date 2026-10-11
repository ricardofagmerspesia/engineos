// `engineos gen router-table` (contracts.md@rev2 §11): renders the CLAUDE.md
// and AGENTS.md router table from registries/intents.json, between two frozen
// marker lines. Only the region between the markers is rewritten; a file
// without both markers is left untouched and reported, the same preserve rule
// gen agent-commands keeps for a hand-customized command.
//
// Idempotent: the region is a pure function of the registry, so a second run
// writes nothing. C38d reuses renderRouterTable and routerTableRegion to fail
// when a committed region differs from what this would write.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Io } from '../io';
import { KernelError } from '../lib/json';
import { loadIntents, type IntentRow, type IntentsRegistry } from '../registry/intents';

const EXIT_OK = 0;
const EXIT_FAILURE = 1;

export const ROUTER_TABLE_BEGIN = '<!-- engineos:router-table:begin -->';
export const ROUTER_TABLE_END = '<!-- engineos:router-table:end -->';
export const ROUTER_TABLE_FILES: readonly string[] = ['CLAUDE.md', 'AGENTS.md'];

const HEADER = '| Intent (signals) | Load |';
const SEPARATOR = '|---|---|';

// The one store-release row of the table is two intents in the registry, split
// so the hook can route Apple and Google Play to different builders. The folded
// row emits nothing; its partner's router_row carries the merged cells. C16's
// arithmetic (intents = rows + 1) is this fold.
const FOLDED_INTO: Readonly<Record<string, string>> = { 'android-release': 'ios-release' };

export type RegionLookup =
  | { kind: 'found'; start: number; end: number; lines: string[] }
  | { kind: 'missing' }
  | { kind: 'malformed'; problem: string };

// Header, separator and one line per row, without a trailing newline.
export function renderRouterTable(intents: IntentsRegistry): string[] {
  const rows = intents.intents.filter((row) => !Object.prototype.hasOwnProperty.call(FOLDED_INTO, row.id));
  return [HEADER, SEPARATOR, ...rows.map((row) => `| ${intentCell(row)} | ${loadCell(row)} |`)];
}

// The lines strictly between the markers, with the marker line indexes. Both
// markers exactly once and in order, each on a line of its own; anything else
// is malformed rather than guessed at, because a rewrite of the wrong span
// would delete hand-written prose.
export function routerTableRegion(text: string): RegionLookup {
  const lines = text.split('\n');
  const begins = indexesOf(lines, ROUTER_TABLE_BEGIN);
  const ends = indexesOf(lines, ROUTER_TABLE_END);
  if (begins.length === 0 && ends.length === 0) return { kind: 'missing' };
  if (begins.length !== 1 || ends.length !== 1) return { kind: 'malformed', problem: 'each marker must appear exactly once' };
  const start = begins[0] ?? 0;
  const end = ends[0] ?? 0;
  if (end < start) return { kind: 'malformed', problem: 'the end marker precedes the begin marker' };
  return { kind: 'found', start, end, lines: lines.slice(start + 1, end) };
}

// The file text with the region replaced, or null when the file has no usable
// region (the caller reports it and writes nothing).
export function withRouterTable(text: string, table: readonly string[]): string | null {
  const region = routerTableRegion(text);
  if (region.kind !== 'found') return null;
  const lines = text.split('\n');
  return [...lines.slice(0, region.start + 1), ...table, ...lines.slice(region.end)].join('\n');
}

export function generateRouterTable(root: string, io: Io): number {
  let table: string[];
  try {
    table = renderRouterTable(loadIntents(root));
  } catch (error) {
    if (error instanceof KernelError) return fail(io, error.message);
    throw error;
  }

  let rewritable = 0;
  for (const file of ROUTER_TABLE_FILES) {
    const path = join(root, file);
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      io.err(`router-table: ${file} not found — skipped\n`);
      continue;
    }
    const region = routerTableRegion(text);
    if (region.kind !== 'found') {
      const why = region.kind === 'missing' ? 'carries no router-table markers' : `has malformed router-table markers (${region.problem})`;
      io.err(`router-table: ${file} ${why} — left untouched\n`);
      continue;
    }
    rewritable += 1;
    const next = withRouterTable(text, table);
    if (next === null || next === text) {
      io.out(`router-table: ${file} up to date\n`);
      continue;
    }
    try {
      writeFileSync(path, next);
    } catch (error) {
      return fail(io, `cannot write ${path}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    io.out(`router-table: ${file} rewritten (${table.length - 2} rows)\n`);
  }
  // Nothing to write anywhere is a misconfigured tree, not a clean run.
  return rewritable === 0 ? fail(io, 'no file carries the router-table markers') : EXIT_OK;
}

// -------------------------------------------------------------------- internals

// Derived cells (router_row absent) follow §11: the title with its phrases, and
// the load list built from the row's own references.
function intentCell(row: IntentRow): string {
  if (row.router_row !== null) return row.router_row.intent;
  const phrases = row.phrases.map((phrase) => `"${phrase.text}"`).join(', ');
  return escapeCell(phrases === '' ? row.title : `${row.title} (${phrases})`);
}

function loadCell(row: IntentRow): string {
  if (row.router_row !== null) return row.router_row.load;
  const parts: string[] = [];
  if (row.rules.length > 0) parts.push(row.rules.map((rule) => `\`rules/${rule}.md\``).join(' + '));
  parts.push(...row.skills.map((skill) => `skill \`${skill}\``));
  parts.push(...row.commands.map((command) => `\`/engineos:${commandName(command)}\``));
  parts.push(...row.agents.map((agent) => `agent \`${agent}\``));
  parts.push(...row.mcp.map((server) => `${server} MCP`));
  const load = parts.join('; ');
  const withNote = row.note === null ? load : `${load} — ${row.note}`;
  return escapeCell(withNote === '' ? row.title : withNote);
}

// The registry spells commands both bare ("new-feature") and qualified
// ("/engineos:implement"); the cell always shows the qualified form.
function commandName(command: string): string {
  return command.replace(/^\/(?:engineos:)?/, '');
}

// A raw pipe would end the cell early; the committed table escapes it as `\|`.
function escapeCell(text: string): string {
  return text.replace(/(?<!\\)\|/g, '\\|');
}

function indexesOf(lines: readonly string[], marker: string): number[] {
  const found: number[] = [];
  lines.forEach((line, index) => {
    if (line === marker) found.push(index);
  });
  return found;
}

function fail(io: Io, message: string): number {
  io.err(`${message}\n`);
  return EXIT_FAILURE;
}
