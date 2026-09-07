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
  /**
   * Hash of the source file as it was when this draft's content was captured.
   * Publish refuses when the file on disk no longer hashes to this — someone
   * else changed it since, and writing the draft would discard their work
   * without either operator ever seeing a conflict.
   *
   * Optional only for rows written before the guard existed; those are treated
   * as an unknown base and refused, which is the fail-closed reading.
   */
  baseHash?: string;
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
