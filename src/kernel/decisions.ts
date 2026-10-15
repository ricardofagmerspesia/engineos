import { KernelError } from '../lib/json';
import type { DecisionRule, DecisionRulesRegistry } from '../registry/decision-rules';
import type { Registries } from './context';
import { asciiDowncase, compilePromptRegex } from './scale';

// The keyword tier of the decision engine (cmd_decision_rules): match the
// prompt against registries/decision-rules.json signals, highest priority
// first. Rules with no signals are model-only by design and never match here.
//
// resolve-task composes its task contract out of this section — the matched
// ids, their `require`, `gate` and `prefer` values, and `any_high` — so the
// section carries every field that assembly reads, in the bash arm's key order.

// cmd_decision_rules' per-match key order: id, require, prefer, gate, risk.
export interface DecisionMatch {
  id: string;
  require: string[];
  prefer: string | null;
  gate: string | null;
  risk: string | null;
}

export interface DecisionsSection {
  matches: DecisionMatch[];
  any_high: boolean;
}

// The section as the task-contract block composes it (contracts.md@rev1 §2.4):
// the trailing key names the rules synthesized from judge facts, and it appears
// only in answers composed with a task-contract fact, so the standalone
// decision-rules arm keeps its pinned two keys.
export interface ComposedDecisionsSection extends DecisionsSection {
  judge_added: string[];
}

export interface DecisionsFacts {
  prompt: string;
}

export function decisionsSection(facts: DecisionsFacts, regs: Registries): DecisionsSection {
  const lower = asciiDowncase(facts.prompt);
  const matches = rulesByPriority(regs.decisionRules)
    .filter((candidate) => candidate.patterns.some((pattern) => pattern.test(lower)))
    .map(({ rule }) => matchOf(rule));
  return {
    matches,
    any_high: matches.some((match) => match.risk === 'high'),
  };
}

// A match synthesized from the registry row rather than from a signal: the
// combination policy's add-only judge fold (contracts.md@rev1 §4.3). An id the
// registry does not declare is a broken caller, not an empty match.
export function matchFromRule(id: string, regs: Registries): DecisionMatch {
  const rule = regs.decisionRules.rules.find((candidate) => candidate.id === id);
  if (rule === undefined) throw new KernelError(`decision-rules.json declares no rule ${id}`);
  return matchOf(rule);
}

// The keyword tier's own ordering, shared so synthesized matches follow the
// same priority order the regex matches do.
export function rulesInPriorityOrder(regs: Registries): DecisionRule[] {
  return rulesByPriority(regs.decisionRules).map(({ rule }) => rule);
}

function matchOf(rule: DecisionRule): DecisionMatch {
  return {
    id: rule.id,
    // Copied, not aliased: a section is an answer, and a caller that edits
    // one must not reach back into the memoised registry.
    require: [...rule.then.require],
    prefer: rule.then.prefer,
    gate: rule.then.gate,
    risk: rule.then.risk,
  };
}

interface CompiledRule {
  rule: DecisionRule;
  patterns: RegExp[];
}

const cache = new WeakMap<DecisionRulesRegistry, CompiledRule[]>();

// Ordering and compilation are properties of the registry, not of the prompt,
// so they happen once per loaded registry.
function rulesByPriority(registry: DecisionRulesRegistry): CompiledRule[] {
  const cached = cache.get(registry);
  if (cached !== undefined) return cached;
  // jq's sort_by is stable and so is Array.prototype.sort, which is what makes
  // rules of equal priority keep registry order in both implementations —
  // visible whenever two priority-100 rules match the same prompt.
  const ordered = [...registry.rules].sort((a, b) => b.priority - a.priority);
  const compiled = ordered.map((rule) => ({
    rule,
    patterns: rule.signals.map((signal, i) =>
      compilePromptRegex(signal, `registries/decision-rules.json: rule ${rule.id} signals[${i}]`),
    ),
  }));
  cache.set(registry, compiled);
  return compiled;
}
