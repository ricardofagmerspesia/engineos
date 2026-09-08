// Family `skill-enablement`: `enabled: false` has to reach the runtime, and
// every answer that recommends skills has to say when it withheld one.
//
// C34 keeps the skills/skills_suppressed pair contained at all three answer
// sites; C35 catches a routing domain left with nothing to recommend because
// every skill it declares was disabled.
//
// Ported from scripts/checks/85-skill-enablement.sh, which was registered
// nowhere: the 1.7.0 port stopped at C31, so the enforcement written alongside
// the kernel's suppression logic was never actually asserted.
import { readSkillState, enabledSkills } from '../kernel/skill-state';
import { isRecord } from '../lib/json';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { Check } from './index';
import { kernelAnswer, loadedOr, preconditionResult } from './kernel-lib';
import { skipPending, type CheckContext } from './lib';

export const C34_FINDINGS = ['answer-lacks-suppressed-pair'] as const;

export const C35_FINDINGS = ['domain-emptied-by-disablement'] as const;

declare module './codes' {
  interface CheckCodes {
    C34: (typeof C34_FINDINGS)[number];
    C35: (typeof C35_FINDINGS)[number];
  }
}

export const SKILL_ENABLEMENT_CHECKS: readonly Check[] = [
  { id: 'C34', codes: C34_FINDINGS, run: checkC34 },
  { id: 'C35', codes: C35_FINDINGS, run: checkC35 },
];

export const C34_TITLE =
  'the three kernel answer sites route-path, route-intent and resolve-task each emit skills together with skills_suppressed';

export const C35_TITLE =
  'no routing domain is left without an enabled skill by disablement';

// The three arms build the answer object themselves, which is why the pair is
// asserted at each of them: a fourth site added without the filter would return
// the raw list, and the symptom is a disabled skill reappearing in a
// recommendation, not an error anyone would see.
export type PairArm = 'route-path' | 'route-intent' | 'resolve-task';

const ROUTING_JSON = 'registries/routing.json';
const INTENT_PROMPT = 'create a new nestjs endpoint';
const SKILLS_KEY = 'skills';
const SUPPRESSED_KEY = 'skills_suppressed';

export function checkC34(ctx: CheckContext): CheckResult[] {
  const routing = loadedOr(() => ctx.registries.routing);
  if (routing === undefined) return [preconditionResult('C34', C34_TITLE, ROUTING_JSON)];
  // A registry where no domain recommends a skill is not a broken tree: there
  // is simply no route-path fixture that can exercise the pair.
  const sample = routing.domains.find(
    (domain) => domain.skills.length > 0 && domain.sample_path !== null && domain.sample_path !== '',
  );
  if (sample === undefined) return skipPending(ctx, 'C34', C34_TITLE, ROUTING_JSON);

  const findings: Finding[] = [
    ...pairFindings('route-path', kernelAnswer(ctx, ['route-path', sample.sample_path ?? ''])),
    ...pairFindings('route-intent', kernelAnswer(ctx, ['route-intent', INTENT_PROMPT])),
    ...pairFindings('resolve-task', kernelAnswer(ctx, ['resolve-task', '--prompt', INTENT_PROMPT])),
  ];
  return [result('C34', C34_TITLE, findings)];
}

// Pure on purpose: the pair is produced by the kernel and not by the tree, so
// no mutation of a checkout can plant the breakage. Structuring the assertion
// as a function over an answer is what makes the negative case testable at all.
export function pairFindings(arm: PairArm, answer: unknown): Finding[] {
  return carriesPairAt(arm, answer) ? [] : [finding('C34', 'answer-lacks-suppressed-pair', arm)];
}

// Disabling a skill is the operator's prerogative. Emptying a whole domain is
// not a choice anyone makes knowingly: the domain keeps routing, keeps loading
// its rules, and starts recommending nothing at all.
export function checkC35(ctx: CheckContext): CheckResult[] {
  const routing = loadedOr(() => ctx.registries.routing);
  if (routing === undefined) return [preconditionResult('C35', C35_TITLE, ROUTING_JSON)];
  const state = readSkillState(ctx.root);
  const findings: Finding[] = [];
  for (const domain of routing.domains) {
    if (domain.skills.length === 0) continue;
    // enabledSkills is the kernel's own predicate, so "absent from this
    // installation" keeps reading as enabled here exactly as it does there — a
    // second reading would make the check disagree with the answer it guards.
    if (enabledSkills(domain.skills, state).length === 0) {
      findings.push(finding('C35', 'domain-emptied-by-disablement', domain.id));
    }
  }
  return [result('C35', C35_TITLE, findings)];
}

// ------------------------------------------------------------------ internals

// jq's `has(...)`: key presence, not value shape. An arm that answered an error
// document, a non-zero exit or unparseable output arrives here as a value that
// carries neither key, which is the same verdict the bash `jq -e` pipeline gave.
function carriesPairAt(arm: PairArm, answer: unknown): boolean {
  if (arm === 'route-path') return carriesPair(answer);
  if (arm === 'resolve-task') return carriesPair(isRecord(answer) ? answer['task_contract'] : undefined);
  const matches = isRecord(answer) ? answer['matches'] : undefined;
  // `(.matches | length) == 0 or all(.matches[]; ...)` — an answer with no
  // matches array at all is a failure, not an empty match list.
  if (!Array.isArray(matches)) return false;
  return matches.every(carriesPair);
}

function carriesPair(value: unknown): boolean {
  return isRecord(value) && SKILLS_KEY in value && SUPPRESSED_KEY in value;
}
