// `engineos usage-report [days]` — which router intents, skills and agents
// actually fire, read from the local Claude session transcripts plus this repo's
// kernel telemetry. Port of scripts/usage-report.sh, which is now a shim over it.
//
// The section headers and the line formats are the surface the retro skill reads,
// so they are reproduced byte for byte from the bash: GNU `uniq -c`'s width-7
// count column, `printf "%6s  %s"`, and jq's `group_by` ordering. Three
// behaviours deliberately differ, each marked DEVIATION where it happens.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import type { Command } from '../dispatch';
import type { Io } from '../io';
import { gitDir } from '../lib/git';
import { isRecord, stringArray } from '../lib/json';

const EXIT_OK = 0;
// No transcript directory, or a `days` argument that is not a positive integer.
const EXIT_FAILURE = 1;

const USAGE = 'usage: engineos usage-report [days]';
const DEFAULT_DAYS = '30';
const MS_PER_DAY = 86_400_000;
const RULE = '='.repeat(33);

// The skills and agents worth counting. Kept as an ordered list rather than a set
// because the report prints them in this order whether they scored or not — a
// zero is the finding.
export const REPORTED_SKILLS: readonly string[] = [
  'nestjs-patterns',
  'react-patterns',
  'llm-engineering',
  'adr',
  'eval-harness',
  'release-notes',
  'record-change',
  'strategy',
];

export const REPORTED_AGENTS: readonly string[] = ['security-reviewer', 'test-writer'];

export interface UsageDeps {
  env: NodeJS.ProcessEnv;
  cwd: string;
  now: () => number;
  spawn: typeof spawnSync;
}

// Transcript counters, accumulated in ONE pass per file. bash re-grepped the whole
// file set once per section; a single pass keeps a large transcript out of memory
// more than once and produces identical numbers.
interface TranscriptStats {
  intents: Map<string, number>;
  skillFiles: Map<string, number>;
  agentFiles: Map<string, number>;
  gateBlocks: number;
}

interface TelemetryEvent {
  event: string;
  data: Record<string, unknown>;
}

// `[router] intent=<slug>` as the bash grep -oE saw it: letters and hyphens only,
// so a trailing ` risk=low` never bleeds into the captured intent.
const ROUTER_INTENT = /\[router\] intent=([a-zA-Z-]+)/g;

// bash matched `"skill"[[:space:]]*:[[:space:]]*"<name>"` — zero or more spaces on
// both sides of the colon. Built once; every reported skill name is a slug, so
// nothing here needs regex escaping.
const SKILL_PATTERNS: ReadonlyMap<string, RegExp> = new Map(
  REPORTED_SKILLS.map((skill) => [skill, new RegExp(`"skill"\\s*:\\s*"${skill}"`)]),
);

export function collectTranscripts(projectsDir: string, days: number, nowMs: number): string[] {
  const cutoff = nowMs - days * MS_PER_DAY;
  const found: string[] = [];
  walk(projectsDir, cutoff, found);
  return found.sort();
}

export function renderReport(days: number, deps: UsageDeps, io: Io): number {
  const projectsDir = join(deps.env['HOME'] ?? '', '.claude', 'projects');
  if (!isDirectory(projectsDir)) {
    io.out(`No transcripts at ${projectsDir}\n`);
    return EXIT_FAILURE;
  }

  io.out(`EngineOS usage — last ${days} days\n`);
  io.out(`${RULE}\n`);

  const files = collectTranscripts(projectsDir, days, deps.now());
  if (files.length === 0) {
    io.out('No transcripts in window.\n');
    return EXIT_OK;
  }

  const stats = readTranscripts(files);
  writeIntents(stats, io);
  writeSkills(stats, io);
  writeAgents(stats, io);
  writeGateHits(stats, io);
  writeTelemetry(days, deps, io);

  io.out('\nZero-hit items are prune candidates — but check the announce habit first.\n');
  return EXIT_OK;
}

// The injection seam is renderReport, which takes UsageDeps directly; this stays a
// plain Command so src/cli.ts registers it unchanged.
export const runUsageReport: Command = (argv, io) => {
  const days = parseDays(argv[0] ?? DEFAULT_DAYS);
  // DEVIATION from bash: a non-numeric window is rejected up front. bash passed it
  // straight to `find -mtime`, which failed silently and reported "No transcripts
  // in window." — an empty report that looked like a finding rather than a typo.
  if (days === null) {
    io.err(`${USAGE}\n`);
    return EXIT_FAILURE;
  }
  return renderReport(days, { env: io.env, cwd: io.cwd(), now: () => Date.now(), spawn: spawnSync }, io);
};

// ------------------------------------------------------------------ internals

function parseDays(raw: string): number | null {
  if (!/^[0-9]+$/.test(raw)) return null;
  const days = Number.parseInt(raw, 10);
  return days > 0 ? days : null;
}

function readEntries(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    // bash sent find's stderr to /dev/null: a missing or unreadable directory is
    // skipped, never an error.
    return [];
  }
}

function walk(dir: string, cutoff: number, found: string[]): void {
  for (const entry of readEntries(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, cutoff, found);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl') && newerThan(path, cutoff)) {
      found.push(path);
    }
  }
}

function newerThan(path: string, cutoff: number): boolean {
  try {
    return statSync(path).mtimeMs > cutoff;
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function readTranscripts(files: string[]): TranscriptStats {
  const stats: TranscriptStats = {
    intents: new Map(),
    skillFiles: new Map(),
    agentFiles: new Map(),
    gateBlocks: 0,
  };
  for (const file of files) {
    const text = readText(file);
    if (text === null) continue;
    for (const match of text.matchAll(ROUTER_INTENT)) {
      const intent = match[1];
      if (intent !== undefined) bump(stats.intents, intent);
    }
    // grep -l counts FILES, not occurrences: a session that invoked one skill
    // forty times is still one session.
    for (const [skill, pattern] of SKILL_PATTERNS) {
      if (pattern.test(text)) bump(stats.skillFiles, skill);
    }
    for (const agent of REPORTED_AGENTS) {
      if (text.includes(agent)) bump(stats.agentFiles, agent);
    }
    // grep -c counts matching LINES, and awk summed them across the file set.
    for (const line of text.split('\n')) {
      if (line.includes('EngineOS gate')) stats.gateBlocks += 1;
    }
  }
  return stats;
}

function bump(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function writeIntents(stats: TranscriptStats, io: Io): void {
  io.out('\n## Router intents ([router] announce lines)\n');
  if (stats.intents.size === 0) {
    // DEVIATION from bash: this line is now reachable. `grep | sed | sort | uniq`
    // exits 0 on no matches, so bash's `|| echo` could never fire and the section
    // was silently empty.
    io.out('(none found — router not announcing?)\n');
    return;
  }
  // `sort -rn`: count descending, and on a tie GNU sort's last-resort comparison
  // over the whole line, reversed — which with a fixed-width count column is the
  // intent in reverse byte order.
  const rows = [...stats.intents.entries()].sort((a, b) => b[1] - a[1] || compareDesc(a[0], b[0]));
  for (const [intent, count] of rows) {
    // GNU `uniq -c` prints the count right-aligned in seven columns, then a space.
    io.out(`${String(count).padStart(7)} ${intent}\n`);
  }
}

function writeSkills(stats: TranscriptStats, io: Io): void {
  io.out('\n## EngineOS skill invocations\n');
  for (const skill of REPORTED_SKILLS) {
    io.out(`${column(stats.skillFiles.get(skill) ?? 0)}  ${skill}\n`);
  }
}

function writeAgents(stats: TranscriptStats, io: Io): void {
  io.out('\n## Subagent dispatches\n');
  for (const agent of REPORTED_AGENTS) {
    io.out(`${column(stats.agentFiles.get(agent) ?? 0)}  ${agent} (sessions mentioning)\n`);
  }
}

function writeGateHits(stats: TranscriptStats, io: Io): void {
  io.out('\n## Hook gate hits (stop-verify blocks)\n');
  io.out(`${stats.gateBlocks} blocks\n`);
}

function writeTelemetry(days: number, deps: UsageDeps, io: Io): void {
  io.out('\n## Kernel telemetry (this repo, .git/engineos-telemetry)\n');
  const dir = gitDir(deps.cwd, deps.spawn);
  const telemetryDir = dir === null ? null : join(dir, 'engineos-telemetry');
  if (telemetryDir === null || !isDirectory(telemetryDir)) {
    // DEVIATION from bash: the ", or jq missing" half of this message is gone. The
    // parsing is native now, so a missing jq can no longer explain an empty block.
    io.out('(none — telemetry not adopted here)\n');
    return;
  }

  const events = readEvents(collectTranscripts(telemetryDir, days, deps.now()));
  const routes = events.filter((e) => e.event === 'route');
  const unrouted = routes.filter((e) => jqLength(e.data['intents']) === 0).length;
  const escalated = routes.filter((e) => jqTruthy(e.data['escalate'])).length;
  io.out(`prompts routed: ${routes.length} (${unrouted} unrouted, ${escalated} escalated)\n`);

  io.out('intents fired:\n');
  writeGrouped(routes.flatMap((e) => stringArray(e.data['intents'])), io);

  io.out('decision rules fired:\n');
  writeGrouped(events.filter((e) => e.event === 'decision-rules').flatMap((e) => stringArray(e.data['rules'])), io);

  const verifies = events.filter((e) => e.event === 'verify');
  const red = verifies.filter((e) => jqTruthy(e.data['failed'])).length;
  io.out(`verify runs: ${verifies.length} (${red} red)\n`);
}

// jq -s would have died on the first unparseable line and printed nothing at all.
// Skipping the bad line instead is the deliberate degradation: a truncated append
// costs one event, not the whole section. The `event` guard is also what excludes
// the *.exec.jsonl span files sharing this directory — spans carry no event.
function readEvents(files: string[]): TelemetryEvent[] {
  const events: TelemetryEvent[] = [];
  for (const file of files) {
    const text = readText(file);
    if (text === null) continue;
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line) as unknown;
      } catch {
        continue;
      }
      if (!isRecord(parsed)) continue;
      const event = parsed['event'];
      if (typeof event !== 'string') continue;
      const data = parsed['data'];
      events.push({ event, data: isRecord(data) ? data : {} });
    }
  }
  return events;
}

// jq's `group_by(.)` sorts ascending, and each group prints as "  <n>  <value>".
function writeGrouped(values: string[], io: Io): void {
  const counts = new Map<string, number>();
  for (const value of values) bump(counts, value);
  const keys = [...counts.keys()].sort();
  for (const key of keys) {
    io.out(`  ${counts.get(key) ?? 0}  ${key}\n`);
  }
}

// jq truthiness, not JavaScript's: only `false` and `null` are false, so a
// recorded `escalate: 0` or `failed: ""` still counts. Reproducing it here is why
// this is a named helper rather than an `if (value)`.
function jqTruthy(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

// jq's `length` on a missing key is 0, because the key reads as null and null has
// length 0 — so a route event with no intents array counts as unrouted.
function jqLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function column(count: number): string {
  // printf "%6s" — the count right-aligned in six columns.
  return String(count).padStart(6);
}

function compareDesc(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? 1 : -1;
}
