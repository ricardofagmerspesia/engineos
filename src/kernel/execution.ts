import { KernelError, isRecord } from '../lib/json';
import type { ExecutionFacts, ExecutionSection } from '../workflow/contracts';
import type { Registries } from './context';

export type { ExecutionFacts, ExecutionSection } from '../workflow/contracts';

const REQUIRED_FACTS: readonly (keyof ExecutionFacts)[] = [
  'complexity', 'riskTier', 'reversible', 'files', 'domains', 'unitCount',
  'newFeature', 'securitySensitive', 'requiredAgents', 'designRequired',
];

export function isSimpleTaskEligible(input: ExecutionFacts, maxFiles: number): boolean {
  const facts = parseExecutionFacts(input);
  return Number.isSafeInteger(maxFiles) && maxFiles > 0 &&
    REQUIRED_FACTS.every((key) => facts[key] !== undefined) &&
    facts.complexity === 'small' && facts.riskTier === 'low' && facts.reversible === true &&
    facts.files !== undefined && facts.files.length <= Math.min(maxFiles, 2) &&
    facts.domains?.length === 1 && facts.unitCount === 1 && facts.securitySensitive === false &&
    facts.requiredAgents?.length === 0 && facts.designRequired === false;
}

// Unknown scope is a request for clarification, never permission for direct writes.
export function executionSection(input: ExecutionFacts, regs: Registries): ExecutionSection {
  const facts = parseExecutionFacts(input);
  const policy = regs.policy.workflow;
  const budget = facts.complexity === undefined ? null : { ...policy.task_budgets[facts.complexity] };
  const section: ExecutionSection = {
    mode: 'unresolved', complexity: facts.complexity ?? null, reasons: [],
    taskBudget: budget, policyCapacity: regs.policy.parallelism.wave_concurrency_cap,
  };
  section.reasons = REQUIRED_FACTS.filter((key) => facts[key] === undefined).map((key) => `missing:${key}`);
  if (section.reasons.length > 0) return section;
  if (budget !== null && facts.unitCount !== undefined && facts.unitCount > budget.max && !facts.budgetRationale?.trim()) {
    section.reasons.push('task-budget-rationale-required');
    return section;
  }
  if (policy.simple_spec_choice === true && isSimpleTaskEligible(facts, policy.direct_max_files)) {
    const current = facts.scopeRevision !== undefined && facts.specChoiceScopeRevision === facts.scopeRevision;
    const decision = current ? facts.specChoice ?? 'pending' : 'pending';
    section.planning = {
      simple: true, decision, scopeRevision: facts.scopeRevision ?? null,
      choices: ['Implement directly', 'Create a lightweight spec'],
      rulesMode: decision === 'spec' ? 'full' : 'stack', previewRequired: decision === 'spec',
    };
    if (decision === 'pending') section.reasons.push('spec-choice-required');
    else if (decision === 'spec') {
      section.mode = 'delegate';
      section.reasons.push('spec-choice-spec');
    } else section.mode = 'direct';
    return section;
  }
  if (facts.complexity !== 'small') section.reasons.push('complexity-not-small');
  if (facts.riskTier !== 'low') section.reasons.push('risk-not-low');
  if (facts.reversible !== true) section.reasons.push('irreversible');
  if (facts.files !== undefined && facts.files.length > policy.direct_max_files) section.reasons.push('file-count-exceeded');
  if (facts.domains?.length !== 1) section.reasons.push('multi-domain');
  if (facts.unitCount !== 1) section.reasons.push('multiple-units');
  if (facts.newFeature === true) section.reasons.push('new-feature');
  if (facts.securitySensitive === true) section.reasons.push('security-sensitive');
  if (facts.designRequired === true) section.reasons.push('design-required');
  if (facts.requiredAgents !== undefined && facts.requiredAgents.length > 0) section.reasons.push('independent-agent-required');
  section.mode = section.reasons.length === 0 ? 'direct' : facts.unitCount === 1 ? 'delegate' : 'parallel';
  return section;
}

export function parseExecutionFacts(value: unknown): ExecutionFacts {
  if (!isRecord(value)) throw new KernelError('execution facts must be an object');
  const facts: ExecutionFacts = {};
  for (const [key, item] of Object.entries(value)) {
    switch (key) {
      case 'complexity':
        if (item !== 'small' && item !== 'medium' && item !== 'large') throw new KernelError('execution complexity must be small|medium|large');
        facts.complexity = item; break;
      case 'riskTier':
        if (item !== 'low' && item !== 'medium' && item !== 'high') throw new KernelError('execution riskTier must be low|medium|high');
        facts.riskTier = item; break;
      case 'reversible': case 'newFeature': case 'securitySensitive': case 'designRequired':
        if (typeof item !== 'boolean') throw new KernelError(`execution ${key} must be a boolean`);
        facts[key] = item; break;
      case 'files': case 'domains': case 'requiredAgents':
        facts[key] = stringList(key, item); break;
      case 'unitCount':
        if (typeof item !== 'number' || !Number.isSafeInteger(item) || item < 1) throw new KernelError('execution unitCount must be a positive integer');
        facts.unitCount = item; break;
      case 'budgetRationale':
        if (typeof item !== 'string' || item.length > 4096) throw new KernelError('execution budgetRationale must be a string of at most 4096 characters');
        facts.budgetRationale = item; break;
      case 'scopeRevision': case 'specChoiceScopeRevision':
        if (typeof item !== 'string' || item.length > 256 || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(item)) throw new KernelError(`execution ${key} must be a revision token of at most 256 characters`);
        facts[key] = item; break;
      case 'specChoice':
        if (item !== 'pending' && item !== 'direct' && item !== 'spec') throw new KernelError('execution specChoice must be pending|direct|spec');
        facts.specChoice = item; break;
      default: throw new KernelError(`execution: unknown fact ${key}`);
    }
  }
  return facts;
}

function stringList(key: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 1000) throw new KernelError(`execution ${key} must be an array of at most 1000 strings`);
  const items: unknown[] = value;
  const result = items.map((item) => {
    if (typeof item !== 'string' || item.trim() !== item || item.length === 0 || item.length > 1024) {
      throw new KernelError(`execution ${key} entries must be nonblank bounded strings`);
    }
    if (key === 'files' && (!/^[A-Za-z0-9_.@/-]+$/.test(item) || item.startsWith('/') || item.split('/').some((part) => part === '' || part === '.' || part === '..'))) {
      throw new KernelError('execution files must be canonical relative exact paths');
    }
    return item;
  });
  if (new Set(result).size !== result.length) throw new KernelError(`execution ${key} contains duplicates`);
  if (key !== 'requiredAgents' && result.length === 0) throw new KernelError(`execution ${key} must declare a nonempty scope`);
  return result;
}
