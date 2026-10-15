import { join } from 'node:path';
import { CONSOLE_ROOT } from '../config';
import { configureDecisionRuntime, isDecisionRuntimeConfigured } from './backend';
import { createEvaluator, getDecisionConfig } from './providers';

/** Compose the feature only when a decision API or separately operated worker requests it. */
export function ensureDecisionRuntime(): void {
  if (isDecisionRuntimeConfigured()) return;
  const config = getDecisionConfig();
  configureDecisionRuntime({
    databasePath: join(CONSOLE_ROOT, '.data', 'console.sqlite'),
    migrationPath: join(CONSOLE_ROOT, 'src', 'lib', 'store', 'migrations', '0001_decisions.sql'),
    config,
    evaluator: createEvaluator(config),
  });
}
