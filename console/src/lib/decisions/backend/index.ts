import type { Evaluator } from '../contracts';
import { parseDecisionInput } from '../core/index';
import { createEvaluator, getDecisionConfig, type DecisionConfig } from '../providers/index';
import { openDecisionDatabase, DecisionError } from './database';
import { DecisionRepository } from './repository';
import { principalFor } from './identity';
import { submitEvidenceCheck, submitReview } from './reviews';
export { DecisionRepository } from './repository';
export { DecisionError, openDecisionDatabase } from './database';
export { setTrustedIdentityResolver } from './identity';
export type { TrustedIdentityResolver } from './identity';
export { submitEvidenceCheck, submitReview } from './reviews';
export interface DecisionRuntime { repository: DecisionRepository; config: DecisionConfig; evaluator: Evaluator }
export interface RuntimeOptions { databasePath: string; migrationPath: string; config: DecisionConfig; evaluator: Evaluator }
let runtime: DecisionRuntime | null=null;
let options: RuntimeOptions | null=null;
export function configureDecisionRuntime(value: RuntimeOptions): void { if(runtime)throw new DecisionError('conflict','Decision runtime already initialized.',409);options=value; }
export function getDecisionRuntime(): DecisionRuntime {
  if(runtime)return runtime;
  if(!options)throw new DecisionError('dependency','Decision runtime has not been configured.',503);
  if(!options.config.enabled)throw new DecisionError('dependency','Decision feature is disabled.',503);
  runtime={repository:new DecisionRepository(openDecisionDatabase(options.databasePath,options.migrationPath)),config:options.config,evaluator:options.evaluator};return runtime;
}
export { principalFor,parseDecisionInput,createEvaluator,getDecisionConfig };
export function isDecisionRuntimeConfigured(): boolean { return options !== null; }
