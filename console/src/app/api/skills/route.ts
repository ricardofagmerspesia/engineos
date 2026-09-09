import { NextResponse } from 'next/server';

import { REPO_ROOT } from '@/lib/config';
import { parseSkills } from '@/lib/entities/skills';
import { listEntities } from '@/lib/store';
import type { SkillEntity } from '@/lib/entities/types';

// GET /api/skills — a pure read.
//
// It used to seed the draft store for every id the store had never seen, which
// made a plain GET a write: any cross-site navigation that reached this route
// filled the local database with rows the operator never opened, and a read
// verb is the last place a reviewer looks for a mutation. The store is seeded
// by the first PUT instead — the only moment a draft actually exists.
//
// Real logic (parsing, store access) lives in entities/skills.ts and lib/store;
// this handler only merges the two views.
export function GET(): NextResponse<SkillEntity[]> {
  const parsed = parseSkills(REPO_ROOT);
  const drafts = listEntities<SkillEntity>('skill');
  const draftById = new Map(drafts.map((entity) => [entity.id, entity]));

  // `usedByAgents` and `dependsOnRules` are DERIVED from agents/, rules/ and
  // the registries — they are not fields anyone edits here, so a stored draft
  // must never be the authority on them. Without this overlay a draft written
  // before an agent started referencing a skill would keep claiming nobody
  // uses it, and the disable warning would stay silent for exactly the skill
  // that most needs it. The edited fields (description, enabled) still come
  // from the draft: overlay the derived pair, nothing else.
  const rows: SkillEntity[] = parsed.map((skill) => {
    const draft = draftById.get(skill.id);
    if (!draft) return skill;
    return { ...draft, usedByAgents: skill.usedByAgents, dependsOnRules: skill.dependsOnRules };
  });

  // A draft whose file is gone stays in the list: that unpublished edit is the
  // only remaining copy of it, and dropping the row would hide the situation
  // rather than let publish report it as a conflict.
  const parsedIds = new Set(parsed.map((skill) => skill.id));
  for (const draft of drafts) {
    if (!parsedIds.has(draft.id)) rows.push(draft);
  }

  return NextResponse.json(rows);
}
