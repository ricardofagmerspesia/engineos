// Parser/writer for `skills/*/SKILL.md` frontmatter. Pure and base-path-injected
// (rules/architecture.md) so the API layer decides the real repo root and a
// future test could point this at a scratch fixture tree instead.
//
// No YAML dependency: today's frontmatter is flat (name/description/enabled),
// and package.json is out of this unit's file scope (owned by the store/scaffold
// unit) — a hand-rolled single-line key/value reader plus JSON-string escaping
// for values (reusing JSON.parse/stringify, not a new dependency) round-trips
// safely without needing full YAML nesting support.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadGraph, resolveSkillRelations } from './relations';
import type { SkillEntity } from './types';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export class SkillWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillWriteError';
  }
}

interface ParsedFrontmatter {
  block: string;
  body: string;
  data: Record<string, string | boolean>;
}

/** Splits raw SKILL.md content into its frontmatter block and body. Throws if no frontmatter block is found. */
function splitFrontmatter(raw: string): { block: string; body: string } {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    throw new Error('no frontmatter block found (file must start with "---")');
  }
  return { block: match[1] ?? '', body: raw.slice(match[0].length) };
}

/** Reads one flat "key: value" line. Values may be a JSON string literal (quoted, escaped) or a bare token. */
function parseFrontmatterLine(line: string, lineNumber: number): [string, string | boolean] | null {
  if (line.trim() === '') return null;
  const match = /^([A-Za-z0-9_-]+):[ \t]?(.*)$/.exec(line);
  if (!match) {
    throw new Error(`unsupported frontmatter syntax at line ${lineNumber}: ${JSON.stringify(line)}`);
  }
  const key = match[1] as string;
  const rawValue = (match[2] ?? '').trim();
  if (rawValue === 'true') return [key, true];
  if (rawValue === 'false') return [key, false];
  if (rawValue.startsWith('"')) {
    try {
      return [key, JSON.parse(rawValue) as string];
    } catch (err) {
      throw new Error(`malformed quoted value at line ${lineNumber}: ${(err as Error).message}`);
    }
  }
  return [key, rawValue];
}

function parseFrontmatterBlock(block: string): Record<string, string | boolean> {
  const data: Record<string, string | boolean> = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseFrontmatterLine(lines[i] ?? '', i + 1);
    if (parsed) data[parsed[0]] = parsed[1];
  }
  return data;
}

function parseSkillFile(raw: string): ParsedFrontmatter {
  const { block, body } = splitFrontmatter(raw);
  const data = parseFrontmatterBlock(block);
  return { block, body, data };
}

function toRelativePath(basePath: string, absolute: string): string {
  return path.relative(basePath, absolute).split(path.sep).join('/');
}

/**
 * Parses every `SKILL.md` under each immediate subdirectory of `<basePath>/skills`,
 * resolving each one's real relations (`usedByAgents`, `dependsOnRules`) against
 * the agents, rules and registries in the same tree — see `relations.ts` for why
 * these must not be the fixed `[]` they used to be.
 * A malformed file yields a `status: 'error'` entity with `parseError` set rather
 * than throwing — one bad file must not stop the rest of the directory from parsing.
 */
export function parseSkills(basePath: string): SkillEntity[] {
  const skillsDir = path.join(basePath, 'skills');
  if (!existsSync(skillsDir)) return [];

  const entries = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const result: SkillEntity[] = [];
  // Read the agent bodies, the registries and the rule list once for the whole
  // directory, not once per skill.
  const graph = loadGraph(basePath);

  for (const entry of entries) {
    const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    const id = entry.name;
    const sourcePaths = [toRelativePath(basePath, skillFile)];
    const updatedAt = statSync(skillFile).mtime.toISOString();

    try {
      const raw = readFileSync(skillFile, 'utf8');
      const { data, body } = parseSkillFile(raw);
      const relations = resolveSkillRelations(graph, id, body);

      const name = typeof data.name === 'string' && data.name.trim() !== '' ? data.name : id;
      const description = typeof data.description === 'string' ? data.description : '';
      const enabled = typeof data.enabled === 'boolean' ? data.enabled : true; // absence means enabled

      result.push({
        id,
        kind: 'skill',
        name,
        status: enabled ? 'active' : 'disabled',
        sourcePaths,
        updatedAt,
        description,
        enabled,
        usedByAgents: relations.usedByAgents,
        dependsOnRules: relations.dependsOnRules,
      });
    } catch (err) {
      result.push({
        id,
        kind: 'skill',
        name: id,
        status: 'error',
        sourcePaths,
        updatedAt,
        description: '',
        enabled: false,
        usedByAgents: [],
        dependsOnRules: [],
        parseError: (err as Error).message,
      });
    }
  }

  return result;
}

export interface FileChange {
  path: string;
  before: string;
  after: string;
}

/** A string needs quoting when a plain (unquoted) line couldn't represent it unambiguously. */
function needsQuoting(value: string): boolean {
  return (
    value === '' ||
    value !== value.trim() ||
    value.includes('"') ||
    value.includes('\\') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value === 'true' ||
    value === 'false'
  );
}

/** Serializes a frontmatter value the way `parseFrontmatterLine` can read back, quoting only when required so untouched-style diffs stay minimal. */
function serializeValue(value: string | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return needsQuoting(value) ? JSON.stringify(value) : value;
}

/** Replaces the line for `key` in place if present, else appends a new line — every other line is left untouched, byte-for-byte. */
function upsertFrontmatterLine(lines: string[], key: string, serialized: string): string[] {
  const keyLineRe = new RegExp(`^${key}:`);
  const index = lines.findIndex((line) => keyLineRe.test(line));
  const newLine = `${key}: ${serialized}`;
  if (index === -1) return [...lines, newLine];
  const next = [...lines];
  next[index] = newLine;
  return next;
}

/**
 * Computes the new file contents for each entity whose `description`/`enabled`
 * differ from what's on disk (compared by value, not raw bytes — an unrelated
 * file's formatting quirks must never make it look "changed"). Pure compute
 * step — reads the current file to diff and to preserve every untouched
 * frontmatter line plus the whole body byte-for-byte, but never writes.
 * Callers pass the result either to a diff view (as-is) or to
 * `applyFileChanges` (fs-writer.ts) to actually publish.
 */
export function writeSkills(basePath: string, entities: SkillEntity[]): FileChange[] {
  const changes: FileChange[] = [];

  for (const entity of entities) {
    const sourcePath = entity.sourcePaths[0];
    if (!sourcePath) {
      throw new SkillWriteError(`skill "${entity.id}" has no sourcePaths to write to`);
    }

    const absolutePath = path.join(basePath, sourcePath);
    const before = readFileSync(absolutePath, 'utf8');
    const { block, body, data } = parseSkillFile(before);

    const onDiskDescription = typeof data.description === 'string' ? data.description : '';
    const onDiskEnabled = typeof data.enabled === 'boolean' ? data.enabled : true; // absence means enabled

    if (entity.description === onDiskDescription && entity.enabled === onDiskEnabled) {
      continue; // in-memory state matches disk — nothing to change
    }

    let lines = block === '' ? [] : block.split(/\r?\n/);
    lines = upsertFrontmatterLine(lines, 'description', serializeValue(entity.description));
    lines = upsertFrontmatterLine(lines, 'enabled', serializeValue(entity.enabled));

    const after = `---\n${lines.join('\n')}\n---\n${body}`;
    changes.push({ path: absolutePath, before, after });
  }

  return changes;
}
