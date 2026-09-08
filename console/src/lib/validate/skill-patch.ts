import type { SkillPatch, ValidationIssue } from '@/lib/entities/types';

export type SkillPatchParse =
  | { ok: true; patch: SkillPatch }
  | { ok: false; issues: ValidationIssue[] };

const ALLOWED_FIELDS: ReadonlySet<string> = new Set(['description', 'enabled']);

// One issue per unknown key made the refusal proportional to whatever the
// caller sent: a body of unique keys came back amplified (2.2 MB in, 14 MB out).
// The named ones are what an operator needs to fix a mistyped field; past that a
// count says the same thing in constant space.
const MAX_UNKNOWN_FIELDS_REPORTED = 5;

/**
 * A JSON body is `unknown` until something checks it. This is that check, and
 * it is an allowlist: only `description` and `enabled` survive, so a patch
 * carrying `id`, `status` or `sourcePaths` is refused here rather than
 * silently spread over the stored entity (rules/security.md, mass assignment).
 *
 * The `enabled: "false"` case is why this exists at all — a truthy string used
 * to reach the store, publish quoted it, and the kernel read a non-boolean as
 * enabled while the console rendered Disabled.
 *
 * Length and emptiness of `description` are NOT checked here: `validateSkill`
 * runs on the merged candidate right after and owns those rules.
 */
export function parseSkillPatch(entityId: string, input: unknown): SkillPatchParse {
  if (!isPlainObject(input)) {
    return { ok: false, issues: [issue(entityId, 'Patch body must be a JSON object.')] };
  }

  const issues: ValidationIssue[] = [];

  const unknownFields = Object.keys(input).filter((key) => !ALLOWED_FIELDS.has(key));

  for (const key of unknownFields.slice(0, MAX_UNKNOWN_FIELDS_REPORTED)) {
    issues.push(issue(entityId, `Unknown field: ${key}.`));
  }

  const unlistedFields = unknownFields.length - MAX_UNKNOWN_FIELDS_REPORTED;
  if (unlistedFields > 0) {
    issues.push(issue(entityId, `${unlistedFields} more unknown fields not listed.`));
  }

  const patch: SkillPatch = {};

  if (input.description !== undefined) {
    if (typeof input.description === 'string') {
      patch.description = input.description;
    } else {
      issues.push(issue(entityId, 'description must be a string.'));
    }
  }

  if (input.enabled !== undefined) {
    if (typeof input.enabled === 'boolean') {
      patch.enabled = input.enabled;
    } else {
      issues.push(issue(entityId, 'enabled must be a boolean.'));
    }
  }

  if (input.description === undefined && input.enabled === undefined) {
    issues.push(issue(entityId, 'Patch carries no field to apply.'));
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, patch };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(entityId: string, message: string): ValidationIssue {
  return { entityId, level: 'error', message };
}
