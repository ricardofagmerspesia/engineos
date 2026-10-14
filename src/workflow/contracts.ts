// Shared delivery contracts; host adapters attest evidence at exact revisions.
export type Complexity = 'small' | 'medium' | 'large';
export type ExecutionMode = 'unresolved' | 'direct' | 'delegate' | 'parallel';

export interface WorkflowPolicy {
  task_budgets: Record<Complexity, { min: number; max: number }>;
  direct_max_files: number;
  simple_spec_choice?: boolean;
  final_validation_prompt?: boolean;
}

export interface ExecutionFacts {
  complexity?: Complexity;
  riskTier?: 'low' | 'medium' | 'high';
  reversible?: boolean;
  files?: string[];
  domains?: string[];
  unitCount?: number;
  newFeature?: boolean;
  securitySensitive?: boolean;
  requiredAgents?: string[];
  designRequired?: boolean;
  budgetRationale?: string;
  scopeRevision?: string;
  specChoice?: 'pending' | 'direct' | 'spec';
  specChoiceScopeRevision?: string;
}

export interface ExecutionSection {
  mode: ExecutionMode;
  complexity: Complexity | null;
  reasons: string[];
  taskBudget: { min: number; max: number } | null;
  policyCapacity: number;
  planning?: {
    simple: boolean;
    decision: 'pending' | 'direct' | 'spec';
    scopeRevision: string | null;
    choices: string[];
    rulesMode: 'stack' | 'full';
    previewRequired: boolean;
  };
}

export interface WorkflowUnit {
  id: string;
  dependsOn: string[];
  files: string[];
  agent: string;
  modelTier: string;
  contractRevision: string;
  requiredChecks: string[];
}

export interface UnitEvidence {
  sourceRevision: string;
  contractRevision: string;
  checks: string[];
  artifacts: string[];
}

export type UnitState = 'planned' | 'ready' | 'running' | 'returned' | 'integrated' | 'blocked' | 'failed' | 'cancelled';

export interface ScheduledUnit extends WorkflowUnit {
  state: UnitState;
  attempts: number;
  handle: string | null;
  reason: string | null;
  evidence: UnitEvidence | null;
}

export interface SchedulerState {
  version: 1;
  runId: string;
  revision: number;
  timestampMs: number;
  hostCapacity: number;
  planningOpen?: boolean;
  units: ScheduledUnit[];
}

export interface SchedulerEvent {
  kind: 'started' | 'returned' | 'integrated' | 'failed' | 'blocked' | 'resumed' | 'cancelled';
  unitId: string;
  revision: number;
  timestampMs: number;
  handle?: string;
  reason?: string;
  evidence?: UnitEvidence;
}

export interface SchedulerAction {
  kind: 'launch' | 'review' | 'blocked';
  unitId: string;
  reason: string;
}

export interface WorkflowEvent {
  version: 1;
  runId: string;
  sequence: number;
  timestampMs: number;
  kind: 'run-started' | 'unit-planned' | 'unit-ready' | 'unit-started' | 'unit-returned' | 'unit-integrated' | 'unit-blocked' | 'unit-failed' | 'unit-cancelled' | 'review-completed' | 'check-completed' | 'useful-result' | 'model-usage' | 'run-completed';
  unitId?: string;
  owner?: string;
  reason?: string;
  evidence?: UnitEvidence;
  calls?: number;
  tokensIn?: number;
  tokensOut?: number;
  costMicros?: number;
}

export interface AgentLauncher {
  capacity(): number;
  launch(unit: WorkflowUnit): Promise<string>;
}
