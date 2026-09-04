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

const { requireRecord, requireString, requireNumber, requireStrings, requireRows, optionalString, optionalStrings } =
  strictReader('decision-rules.json');

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
        signals: optionalStrings(row['signals'], `${at}.signals`),
      };
    }),
  };
}
