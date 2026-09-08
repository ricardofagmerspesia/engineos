// The rule-deferral graph CLAUDE.md's closure rule is checked against, plus the
// two rule sets that graph is pruned by.
//
// scripts/checks/lib.sh and scripts/run-evals.sh each carried a copy of this
// derivation, and a divergence between them would let an eval case pass a closure
// the validator fails (or the reverse). This is the one TypeScript home; the
// checks port consumes it too.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The policy bundle resolve-task supplies for every substantive task. A rule that
// points at one of these is not deferring to something a router row must name.
export const TASK_CONTRACT_RULES: readonly string[] = ['gates', 'models', 'parallelism', 'risk-autonomy', 'verification'];

// sed -n 's|^@rules/\([a-z-]*\)\.md.*|\1|p' — anchored at line start, and the
// slug class deliberately excludes '.', so `@rules/a.b.md` names no rule.
const IMPORT_LINE = /^@rules\/([a-z-]*)\.md/;

const MD = '.md';

// The always-on set: the rules CLAUDE.md imports, so every turn already carries
// them. Byte-order unique, as `sort -u` produced.
export function alwaysOnRules(claudeMdText: string): string[] {
  const names = new Set<string>();
  for (const line of claudeMdText.split('\n')) {
    const matched = IMPORT_LINE.exec(line);
    const name = matched === null ? undefined : matched[1];
    if (name !== undefined) names.add(name);
  }
  return [...names].sort();
}

// Basenames of <root>/rules/*.md without the extension, byte-order. A missing
// rules/ directory answers with nothing rather than throwing: the callers grade
// an eval set against a tree, and an absent tree is a finding of theirs, not a
// crash of this module's.
export function ruleNames(root: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(join(root, 'rules'));
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith(MD))
    .map((name) => name.slice(0, name.length - MD.length))
    .sort();
}

// Rule `rule` defers to rule `s` when its text names `s.md` and `s` is not
// supplied globally — by CLAUDE.md's imports (alwaysOn) or by the task contract.
// Every router row loading `rule` must then also load `s`.
export function deferralsOf(root: string, rule: string, alwaysOn: readonly string[]): string[] {
  let text: string;
  try {
    text = readFileSync(join(root, 'rules', `${rule}.md`), 'utf8');
  } catch {
    return [];
  }
  const deferrals: string[] = [];
  for (const name of ruleNames(root)) {
    if (name === rule) continue;
    if (alwaysOn.includes(name)) continue;
    if (TASK_CONTRACT_RULES.includes(name)) continue;
    if (mentions(text, name)) deferrals.push(name);
  }
  return deferrals;
}

// The bash pattern was grep -E "(rules/)?`?<name>\.md". Both prefixes are
// optional and the expression is unanchored, so it is exactly a substring search
// for "<name>.md" — which is what makes it catch all three forms the rules use
// (`rules/x.md`, a bare `x.md`, and one inside a code span).
function mentions(text: string, name: string): boolean {
  return text.includes(`${name}${MD}`);
}
