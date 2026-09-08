// Entity shapes come from the real frozen-contract module now that it has
// landed (Unit B). Only the API-response-only shapes that belong to this
// unit's routes (diff/publish/history/rollback) are declared here.
export type { EntityStatus, BaseEntity, SkillEntity, SkillPatch, ValidationIssue } from "@/lib/entities/types";
import type { ValidationIssue } from "@/lib/entities/types";

// Matches console/src/app/api/diff/route.ts exactly (read at integration —
// that route does not return a validation field, despite the design's §7
// call for "validation errors/warnings per entity" on /publish). `validation`
// is kept optional and read defensively via `getValidationIssues` so this UI
// picks it up for free if a later change adds it, without assuming a shape
// that doesn't exist today. In the current API, per-entity validation only
// surfaces from POST /api/publish's `errors[]` on an ok:false response,
// which publish-page-client.tsx renders separately.
export interface DiffEntry {
  entityId: string;
  kind: string;
  fieldDiff: Record<string, unknown>;
  fileDiff: string;
  validation?: ValidationIssue[];
}

export function getValidationIssues(entry: DiffEntry): ValidationIssue[] {
  const candidate =
    entry.validation ??
    (entry as unknown as { validationIssues?: ValidationIssue[] }).validationIssues ??
    (entry as unknown as { issues?: ValidationIssue[] }).issues;
  return Array.isArray(candidate) ? candidate : [];
}

export interface PublishResult {
  ok: boolean;
  commitSha?: string;
  summary?: string;
  reason?: string;
  errors?: ValidationIssue[];
}

// Matches console/src/lib/store/client.ts's `PublishHistoryRecord` (what
// GET /api/history actually serializes) — numeric `id`, and an already-
// parsed `diff: unknown`, NOT the `diff_json: string` the original frozen
// contract in the change record described. Reconciled to ground truth here;
// see this unit's final report for the drift note.
export interface HistoryEntry {
  id: number;
  commitSha: string;
  createdAt: string;
  summary: string;
  diff: unknown;
}

export interface RollbackResult {
  ok: boolean;
  revertSha?: string;
  reason?: string;
}
