// Parser/writer for `skills/*/SKILL.md` frontmatter. Pure and base-path-injected
// (rules/architecture.md) so the API layer decides the real repo root and a
// future test could point this at a scratch fixture tree instead.
//
// No YAML dependency: today's frontmatter is flat (name/description/enabled),
// and package.json is out of this unit's file scope (owned by the store/scaffold
// unit) — a hand-rolled single-line key/value reader plus JSON-string escaping
// for values (reusing JSON.parse/stringify, not a new dependency) round-trips
// safely without needing full YAML nesting support.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveInside } from '../contained-path';
import { parseMarkdownWithFrontmatter } from './frontmatter';
import { loadGraph, resolveSkillRelations } from './relations';
import type { SkillEntity } from './types';

export class SkillWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillWriteError';
  }
}

/**
 * Identity of a source file's exact bytes. Not a timestamp: mtime moves when a
 * tool rewrites a file with identical content, and does not move at all on some
 * filesystems within the same second — either way it answers the wrong
 * question. What publish needs to know is whether the CONTENT changed.
 */
export function hashSource(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export interface BaseConflict {
  entityId: string;
  sourcePath: string;
  /** 'changed' — the file moved on since this draft; 'unknown-base' — the draft predates the guard; 'missing' — the file is gone. */
  reason: 'changed' | 'unknown-base' | 'missing';
}

/**
 * Compares each entity's recorded base against the file on disk right now.
 *
 * This is the whole point of the guard, so it is worth stating plainly: the
 * console edits a COPY. Between the moment a draft captured a file and the
 * moment someone clicks publish, that file can be edited by hand, by another
 * console session, or by a git operation. Writing the draft then silently
 * discards that work — no error, no diff, no trace. Publishing is refused
 * instead, and the operator is told which files moved.
 *
 * Pure and read-only: it never writes, so publish can call it before touching
 * anything.
 */
export function detectBaseConflicts(basePath: string, entities: SkillEntity[]): BaseConflict[] {
  const conflicts: BaseConflict[] = [];

  for (const entity of entities) {
    const sourcePath = entity.sourcePaths[0];
    if (!sourcePath) {
      conflicts.push({ entityId: entity.id, sourcePath: '(none)', reason: 'missing' });
      continue;
    }

    const absolutePath = path.join(basePath, sourcePath);
    if (!existsSync(absolutePath)) {
      conflicts.push({ entityId: entity.id, sourcePath, reason: 'missing' });
      continue;
    }

    if (!entity.baseHash) {
      conflicts.push({ entityId: entity.id, sourcePath, reason: 'unknown-base' });
      continue;
    }

    if (hashSource(readFileSync(absolutePath, 'utf8')) !== entity.baseHash) {
      conflicts.push({ entityId: entity.id, sourcePath, reason: 'changed' });
    }
  }

  return conflicts;
}

/**
 * SKILL.md's frontmatter dialect is the shared one; the reader lives in
 * `frontmatter.ts` so agents and skills cannot drift into two dialects.
 */
function parseSkillFile(raw: string) {
  return parseMarkdownWithFrontmatter(raw);
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
      const baseHash = hashSource(raw);

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
        baseHash,
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

/**
 * A string needs quoting when a plain (unquoted) line couldn't represent it
 * unambiguously.
 *
 * The last four cases are about the file's readers, not this app's: `frontmatter.ts`
 * happens to read `description: a: b` back as the literal `a: b`, but the block
 * is YAML by declaration and a real YAML parser rejects that line outright. The
 * console must not publish a frontmatter block only its own reader can parse,
 * so a value carrying a mapping separator (`: `), an inline comment (` #`), or
 * opening as a comment (`#`) or a sequence entry (`- `) gets quoted.
 */
function needsQuoting(value: string): boolean {
  return (
    value === '' ||
    value !== value.trim() ||
    value.includes('"') ||
    value.includes('\\') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.includes(': ') ||
    value.includes(' #') ||
    value.startsWith('#') ||
    value.startsWith('- ') ||
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

    // `sourcePath` comes out of the draft store, not out of this codebase, so
    // the join that turns it absolute is a containment check as well —
    // `resolveInside` is the same function the publish route uses to match a
    // computed change back to its entity, so neither side can drift.
    const absolutePath = resolveInside(basePath, sourcePath);
    const before = readFileSync(absolutePath, 'utf8');

    // Second line of defence. Publish calls detectBaseConflicts first and
    // aborts before reaching here, but the compute seam refusing on its own
    // means a future caller cannot reintroduce the silent-clobber path just by
    // forgetting the pre-check.
    if (entity.baseHash && hashSource(before) !== entity.baseHash) {
      throw new SkillWriteError(
        `skill "${entity.id}": ${sourcePath} changed on disk since this draft was captured — refusing to overwrite it`,
      );
    }

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
