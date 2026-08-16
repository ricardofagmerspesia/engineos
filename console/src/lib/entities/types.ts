// Frozen contract — see `.engineos/changes/2026-08-15-admin-console-skills-vertical.md`.
// Do not renegotiate shapes here mid-wave; open a follow-up change record instead.

export type EntityStatus = 'active' | 'draft-only' | 'disabled' | 'error';

export interface BaseEntity {
  id: string;
  name: string;
  status: EntityStatus;
  sourcePaths: string[];
  updatedAt: string; // ISO
}

export interface SkillEntity extends BaseEntity {
  kind: 'skill';
  description: string;
  enabled: boolean;
  usedByAgents: string[]; // agent ids/aliases referencing this skill (empty until Agents ticket lands)
  dependsOnRules: string[]; // rule ids referenced by SKILL.md body (best-effort scan)
  parseError?: string; // set + status:'error' when frontmatter is malformed
}

// Used by the validation layer (Unit C) and returned in 422s / publish failures.
export interface ValidationIssue {
  entityId: string;
  level: 'error' | 'warn';
  message: string;
}
