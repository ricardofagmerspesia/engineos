// The repository facts the judge request may carry (contracts.md@rev3 §10.2):
// the declared stack's ids and two booleans. Nothing else from the project
// reaches the request. Split out of ./prompt-judge-consult so the consultation
// stays one concern.
import { join } from 'node:path';
import type { JudgeInput } from '../judge';
import { loadProjectConfig } from '../registry/project-config';
import { activeChangeRecords } from './change-records';

// A change record links its spec when one was required (CLAUDE.md #5).
const SPEC_LINK = /docs\/specs\//;

export function repositoryFacts(repo: string): JudgeInput['repository'] {
  if (repo === '') return { declared_stack: [], active_spec: false, open_change_record: false };
  const records = [...activeChangeRecords(join(repo, '.engineos', 'changes'))];
  return {
    declared_stack: declaredStack(repo),
    active_spec: records.some((text) => SPEC_LINK.test(text)),
    open_change_record: records.length > 0,
  };
}

function declaredStack(repo: string): string[] {
  try {
    const config = loadProjectConfig(repo);
    if (config === null) return [];
    const ids = config.stack.packages.flatMap((pkg) => (pkg.framework === null ? [pkg.language] : [pkg.language, pkg.framework]));
    return [...new Set(ids)];
  } catch {
    return [];
  }
}
