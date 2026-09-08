import { apiFetch } from "./client";
import type { SkillEntity, SkillPatch } from "../types";

export function fetchSkills(): Promise<SkillEntity[]> {
  return apiFetch<SkillEntity[]>("/api/skills");
}

// Re-exported so the skills page keeps importing the patch shape from the API
// module it calls. The definition itself lives with the entity types, where the
// route's parser reads it from too.
export type { SkillPatch };

export function updateSkill(id: string, patch: SkillPatch): Promise<SkillEntity> {
  return apiFetch<SkillEntity>(`/api/skills/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
