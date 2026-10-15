import { loadRegistry } from './load';
import { strictReader } from './strict';

// registries/decision-rules.json is the keyword tier of the decision engine: a
// matched row names a gate, a risk tier and the artifacts a task owes. Its
// answers ARE gates, so this loader is strict for the same reason the policy
// loader is — a defaulted field would answer for a file that says nothing.
//
// Optionality mirrors cmd_decision_rules' jq rather than being stricter than
// the registry's own contract: `then.require // []`, `then.prefer // null`,
// `then.gate // null`, `then.risk // null`, and `select(.signals != null)`.
// Check C14 (scripts/checks/20-registries.sh) accepts a rule that only prefers,
// so demanding `then.require` here would refuse a file the validator passes.
//
// `then.prefer` is a single string in the registry, not a list: resolve-task
// collects preferences with `map(.prefer // empty) | .[]`, which yields one
// value per matched rule.

export interface DecisionOutcome {
  require: string[];
  gate: string | null;
  risk: string | null;
  prefer: string | null;
}

export interface DecisionRule {
  id: string;
  priority: number;
  source: string;
  // The model tier's condition object. The keyword tier never evaluates it, so
  // its shape stays open — validating fields nothing reads would be inventing a
  // schema the registry never promised.
  when: Record<string, unknown>;
  then: DecisionOutcome;
  // The judge fact that can add this rule (contracts.md@rev2 §6.3): the
  // `fact.<name>` question suffix src/judge/questions.ts generates, so this
  // registry is the one source of the fact vocabulary. Null means the rule is
  // never judge-added — derived in code, or owed by every change.
  judge_fact: string | null;
  // The probability cut at which a jev fact adds the rule; null falls back to
  // policy.json judge.thresholds.rule_default.
  judge_threshold: number | null;
  // A rule with no signals is model-only by design. An empty list says that the
  // same way jq's `select(.signals != null)` did: the keyword tier cannot match
  // it, because there is nothing to match against.
  signals: string[];
}

export interface DecisionRulesRegistry {
  version: string;
  precedence: string[];
  conflict_policy: string;
  rules: DecisionRule[];
}

const { malformed, requireRecord, requireString, requireNumber, requireStrings, requireRows, optionalString, optionalStrings } =
  strictReader('decision-rules.json');

// A fact name becomes a question key (`fact.<name>`) and a telemetry-safe id, so
// it is a lower-case identifier rather than free text.
const JUDGE_FACT = /^[a-z][a-z0-9_]*$/;

export function loadDecisionRules(root: string): DecisionRulesRegistry {
  const raw = loadRegistry(root, 'decision-rules.json');
  const d = requireRecord(raw, '');
  return {
    version: requireString(d['version'], '.version'),
    precedence: requireStrings(d['precedence'], '.precedence'),
    conflict_policy: requireString(d['conflict_policy'], '.conflict_policy'),
    rules: requireRows(d['rules'], '.rules').map((row, i) => {
      const at = `.rules[${i}]`;
      const then = requireRecord(row['then'], `${at}.then`);
      return {
        id: requireString(row['id'], `${at}.id`),
        priority: requireNumber(row['priority'], `${at}.priority`),
        source: requireString(row['source'], `${at}.source`),
        when: requireRecord(row['when'], `${at}.when`),
        then: {
          require: optionalStrings(then['require'], `${at}.then.require`),
          gate: optionalString(then['gate'], `${at}.then.gate`),
          risk: optionalString(then['risk'], `${at}.then.risk`),
          prefer: optionalString(then['prefer'], `${at}.then.prefer`),
        },
        ...judgeFields(row, at),
        signals: optionalStrings(row['signals'], `${at}.signals`),
      };
    }),
  };
}

function judgeFields(row: Record<string, unknown>, at: string): Pick<DecisionRule, 'judge_fact' | 'judge_threshold'> {
  const fact = optionalString(row['judge_fact'], `${at}.judge_fact`);
  if (fact !== null && !JUDGE_FACT.test(fact)) malformed(`${at}.judge_fact must be a lower-case identifier`);
  const threshold = row['judge_threshold'];
  if (threshold === undefined || threshold === null) return { judge_fact: fact, judge_threshold: null };
  // A cut with no fact to compare it against can never fire, which is a
  // registry mistake rather than a harmless extra.
  if (fact === null) malformed(`${at}.judge_threshold requires a judge_fact`);
  const cut = requireNumber(threshold, `${at}.judge_threshold`);
  // Zero is refused with the rest of [0,1]'s outside: a rule the judge never
  // scored reads as probability 0, so a zero cut would add it on every prompt.
  if (cut <= 0 || cut > 1) malformed(`${at}.judge_threshold must be greater than 0 and at most 1`);
  return { judge_fact: fact, judge_threshold: cut };
}
