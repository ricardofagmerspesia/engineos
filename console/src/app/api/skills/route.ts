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
  const stored = listEntities<SkillEntity>('skill');
  const draftIds = new Set(stored.map((entity) => entity.id));

  // Seed the draft store from the real files only for ids the store has never
  // seen — reopening the console must surface a prior session's unpublished
  // edits, not clobber them with what's on disk right now.
  for (const skill of parsed) {
    if (!draftIds.has(skill.id)) {
      upsertEntity(skill);
    }
  }

  // `usedByAgents` and `dependsOnRules` are DERIVED from agents/, rules/ and
  // the registries — they are not fields anyone edits here, so a stored draft
  // must never be the authority on them. Without this overlay a draft written
  // before an agent started referencing a skill would keep claiming nobody
  // uses it, and the disable warning would stay silent for exactly the skill
  // that most needs it. The edited fields (description, enabled) still come
  // from the draft: overlay the derived pair, nothing else.
  const relationsById = new Map(parsed.map((skill) => [skill.id, skill]));
  const withRelations = listEntities<SkillEntity>('skill').map((entity) => {
    const fresh = relationsById.get(entity.id);
    if (!fresh) return entity; // draft for a skill no longer on disk — leave as stored
    return {
      ...entity,
      usedByAgents: fresh.usedByAgents,
      dependsOnRules: fresh.dependsOnRules,
    };
  });

  return NextResponse.json(withRelations);
}
