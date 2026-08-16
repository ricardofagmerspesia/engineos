import { apiFetch } from "./client";
import type { SkillEntity } from "../types";

export function fetchSkills(): Promise<SkillEntity[]> {
  return apiFetch<SkillEntity[]>("/api/skills");
}

export type SkillPatch = Partial<Pick<SkillEntity, "description" | "enabled">>;

export function updateSkill(id: string, patch: SkillPatch): Promise<SkillEntity> {
  return apiFetch<SkillEntity>(`/api/skills/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
