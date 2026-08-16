import type { SkillEntity, ValidationIssue } from '@/lib/entities/types';

const MAX_DESCRIPTION_LENGTH = 2000;

/**
 * Validates a (possibly not-yet-persisted) skill entity — used both inline on
 * PUT /api/skills/:id and authoritatively again at publish time (design §6.2/6.4).
 *
 * The `usedByAgents` warn path is wired now even though the field is always `[]`
 * until the Agents ticket lands, so that ticket doesn't have to reopen this file.
 */
export function validateSkill(entity: SkillEntity): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const description = entity.description?.trim() ?? '';
  if (description.length === 0) {
    issues.push({
      entityId: entity.id,
      level: 'error',
      message: 'Description is required.',
    });
  } else if (entity.description.length > MAX_DESCRIPTION_LENGTH) {
    issues.push({
      entityId: entity.id,
      level: 'error',
      message: `Description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${entity.description.length}).`,
    });
  }

  if (!entity.enabled && entity.usedByAgents.length > 0) {
    issues.push({
      entityId: entity.id,
      level: 'warn',
      message: `Disabling this skill affects ${entity.usedByAgents.length} agent(s) still referencing it: ${entity.usedByAgents.join(', ')}.`,
    });
  }

  return issues;
}
