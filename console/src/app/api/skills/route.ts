import { NextResponse } from 'next/server';

import { REPO_ROOT } from '@/lib/config';
import { parseSkills } from '@/lib/entities/skills';
import { listEntities, upsertEntity } from '@/lib/store';
import type { SkillEntity } from '@/lib/entities/types';

// GET /api/skills — real logic (parsing, store access) lives in
// entities/skills.ts and lib/store; this handler only orchestrates the
// seed-then-read sequence.
export function GET(): NextResponse<SkillEntity[]> {
  const parsed = parseSkills(REPO_ROOT);
  const draftIds = new Set(listEntities<SkillEntity>('skill').map((entity) => entity.id));

  // Seed the draft store from the real files only for ids the store has never
  // seen — reopening the console must surface a prior session's unpublished
  // edits, not clobber them with what's on disk right now.
  for (const skill of parsed) {
    if (!draftIds.has(skill.id)) {
      upsertEntity(skill);
    }
  }

  return NextResponse.json(listEntities<SkillEntity>('skill'));
}
