import path from 'node:path';

import { NextResponse } from 'next/server';

import { REPO_ROOT } from '@/lib/config';
import { buildLineDiff } from '@/lib/diff-text';
import { writeSkills } from '@/lib/entities/skills';
import { getSnapshot, listEntities } from '@/lib/store';
import { validateSkill } from '@/lib/validate/skills';
import type { SkillEntity, ValidationIssue } from '@/lib/entities/types';

interface DiffEntry {
  entityId: string;
  kind: string;
  fieldDiff: Record<string, { before: unknown; after: unknown }>;
  fileDiff: string;
  // Additive beyond the frozen contract text: the /publish screen (Unit D)
  // reads this defensively (`getValidationIssues`) to show per-entity errors
  // and warnings inline with the diff, per design §7.
  validation: ValidationIssue[];
}

function computeFieldDiff(
  before: SkillEntity | undefined,
  after: SkillEntity,
): Record<string, { before: unknown; after: unknown }> {
  const beforeRecord = before as unknown as Record<string, unknown> | undefined;
  const afterRecord = after as unknown as Record<string, unknown>;
  const keys = new Set([...(beforeRecord ? Object.keys(beforeRecord) : []), ...Object.keys(afterRecord)]);
  const fieldDiff: Record<string, { before: unknown; after: unknown }> = {};

  for (const key of keys) {
    const beforeValue = beforeRecord?.[key];
    const afterValue = afterRecord[key];
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      fieldDiff[key] = { before: beforeValue, after: afterValue };
    }
  }

  return fieldDiff;
}

// GET /api/diff — design §6.3. `writeSkills` reads current on-disk content
// itself to build before/after (entities/skills.ts); this route never writes
// anything, so the working tree stays untouched either way.
export function GET(): NextResponse<DiffEntry[]> {
  const draftSkills = listEntities<SkillEntity>('skill');
  const snapshotById = new Map(getSnapshot<SkillEntity>('skill').map((entity) => [entity.id, entity]));

  const changed = draftSkills.filter((entity) => {
    const snapshot = snapshotById.get(entity.id);
    // No snapshot row yet means this id is newly enabled for tracking — treat
    // it as changed so it shows up for review before its first publish.
    return !snapshot || JSON.stringify(snapshot) !== JSON.stringify(entity);
  });

  if (changed.length === 0) {
    return NextResponse.json([]);
  }

  // A malformed on-disk file (status:'error') could make writeSkills throw
  // while computing content for it; that must not take down field-level
  // diffing for every other changed entity, so file-diff degrades to '' here.
  let fileChanges: ReturnType<typeof writeSkills> = [];
  try {
    fileChanges = writeSkills(REPO_ROOT, changed);
  } catch {
    fileChanges = [];
  }

  const changeByAbsolutePath = new Map(fileChanges.map((change) => [change.path, change]));

  const results: DiffEntry[] = changed.map((entity) => {
    const snapshot = snapshotById.get(entity.id);
    const fieldDiff = computeFieldDiff(snapshot, entity);

    const sourcePath = entity.sourcePaths[0];
    const absolutePath = sourcePath ? path.join(REPO_ROOT, sourcePath) : undefined;
    const fileChange = absolutePath ? changeByAbsolutePath.get(absolutePath) : undefined;
    const fileDiff = fileChange ? buildLineDiff(fileChange.before, fileChange.after) : '';

    return {
      entityId: entity.id,
      kind: entity.kind,
      fieldDiff,
      fileDiff,
      validation: validateSkill(entity),
    };
  });

  return NextResponse.json(results);
}
