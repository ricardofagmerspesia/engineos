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

/**
 * An agent as `agents/<id>.md` declares it. READ-ONLY on purpose.
 *
 * There is no `enabled` here, and adding one would be a mistake worth naming:
 * `enabled` on skills sat in the UI for months with no reader outside the
 * console, so disabling one changed a file and nothing else. A switch is added
 * after the runtime honours it, never before — otherwise the console grows
 * controls that only look like controls.
 */
export interface AgentEntity extends BaseEntity {
  kind: 'agent';
  description: string;
  alias: string | null;
  tools: string[];
  model: string;
  tier: string;
  /** Skills this agent is bound to, by the same two grounds `relations.ts` uses. */
  usesSkills: string[];
  /** Routing domains that dispatch to this agent. */
  routedDomains: string[];
  /** Workflow capabilities bound to this agent in `registries/capabilities.json`. */
  capabilityIds: string[];
  parseError?: string;
}

/**
 * A model tier as `registries/models.json` defines it. Read-only for the same
 * reason, plus one of its own: the tier table is checked against
 * `rules/models.md` by an integrity check, so editing it here without moving
 * the prose would turn the check red rather than change behaviour.
 */
export interface ModelEntity extends BaseEntity {
  kind: 'model';
  /** The provider model this tier binds to. */
  model: string;
  /** Tier this one escalates to, or null at the top. */
  escalatesTo: string | null;
  /** Work types routed to this tier. */
  workTypes: string[];
  /** Agents whose declared tier is this one. */
  usedByAgents: string[];
}

// Used by the validation layer (Unit C) and returned in 422s / publish failures.
export interface ValidationIssue {
  entityId: string;
  level: 'error' | 'warn';
  message: string;
}
