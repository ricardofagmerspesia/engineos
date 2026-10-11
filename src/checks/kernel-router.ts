// Family 50-kernel, second half: the router agent's wiring to the kernel (C18*).
//
// The deterministic kernel decides when it cannot resolve a request on its own
// and a model (agents/router.md) must produce a dispatch plan. These checks
// defend the seam: the capability binding, the agent's single kernel call, its
// read-only tool set, and the prompt adapter that carries the whole hot path.
// C18d, the suppression-data check, is the one member that reads its registry
// raw and lives in kernel-suppression.ts; ROUTER_CHECKS below carries it.
// Spec: docs/specs/2026-08-06-decision-kernel-p3-router-agent.md
import { frontmatterValue } from '../gen/frontmatter';
import { loadCapabilities } from '../registry/capabilities';
import { TASK_CONTRACT_RULES } from '../lib/deferrals';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { Check } from './index';
import {
  isExecutable,
  kernelAnswer,
  loadedOr,
  missingInputs,
  preconditionResult,
  rawJson,
  ROUTER_AGENT_TOKEN,
  ROUTER_INPUTS,
  ROUTER_MD,
  ROUTER_TOKEN,
  rows,
  sameList,
  sorted,
  stringsOf,
  subRecord,
  uniqueSorted,
} from './kernel-lib';
import { SUPPRESSION_CHECK } from './kernel-suppression';
import { skipOnce, type CheckContext } from './lib';

export const C18_FINDINGS = ['capability-not-bound', 'router-agent-missing', 'tier-model-mismatch'] as const;
export const C18B_FINDINGS = ['kernel-fact-missing'] as const;
export const C18C_FINDINGS = ['bash-tool-missing', 'forbidden-tool'] as const;
export const C18E_FINDINGS = [
  'fixture-escalate-mismatch',
  'fixture-reasons-mismatch',
  'fixture-intents-mismatch',
] as const;
export const C18F_FINDINGS = [
  'adapter-not-executable',
  'registration-not-single-adapter',
  'resolve-task-call-missing',
  'hook-target-missing',
] as const;
export const C18G_FINDINGS = ['policy-closure-drift', 'pure-question-not-lean'] as const;

declare module './codes' {
  interface CheckCodes {
    C18: (typeof C18_FINDINGS)[number];
    C18b: (typeof C18B_FINDINGS)[number];
    C18c: (typeof C18C_FINDINGS)[number];
    C18e: (typeof C18E_FINDINGS)[number];
    C18f: (typeof C18F_FINDINGS)[number];
    C18g: (typeof C18G_FINDINGS)[number];
  }
}

const POLICY_JSON = 'registries/policy.json';
const HOOKS_JSON = 'hooks/hooks.json';
const PROMPT_ADVISOR = 'hooks/prompt-advisor.sh';
const PROMPT_ADVISOR_TS = 'src/hooks/prompt-advisor.ts';

const C18_TITLE = 'route capability is bound to the router agent at its declared design-tier model';
const C18B_TITLE = 'agents/router.md resolves the plan through one kernel call declaring every required fact';
const C18C_TITLE = 'router must not hold Edit/Write/Task';
const C18E_TITLE = 'every policy.json router fixture matches the kernel route-escalate answer';
const C18F_TITLE =
  'hooks/prompt-advisor.sh is the single registered prompt adapter, src/hooks/prompt-advisor.ts calls resolve-task, and every hooks.json script exists';
const C18G_TITLE = 'resolve-task supplies the closed substantive policy bundle and keeps pure questions lean';

// The registry-to-registry half of this binding (the capability resolves, the
// tier is valid) is C15/C15b's. What survives here and nowhere else is the
// registry-to-frontmatter half: the tier the route capability claims must
// resolve, in models.json, to the model the router agent itself declares.
function checkC18(ctx: CheckContext): CheckResult[] {
  if (missingInputs(ctx, ROUTER_INPUTS)) return skipOnce(ctx, 'C18', C18_TITLE, ROUTER_TOKEN);
  const capabilities = loadedOr(() => loadCapabilities(ctx.root));
  const route = capabilities?.capabilities.find((row) => row.id === 'route');
  if (route === undefined || route.agent !== 'router' || route.model_tier !== 'design') {
    return [
      result('C18', C18_TITLE, [
        finding('C18', 'capability-not-bound', `${orNone(route?.agent)}/${orNone(route?.model_tier)}`),
      ]),
    ];
  }
  const agentText = ctx.readText(ROUTER_MD);
  // bash folded a missing agents/router.md into the "not bound" branch, which
  // named the registry for a defect in the agent file. Split, because the two
  // have different owners and different fixes.
  if (agentText === undefined) {
    return [result('C18', C18_TITLE, [finding('C18', 'router-agent-missing', ROUTER_MD)])];
  }
  const models = loadedOr(() => ctx.registries.models);
  const tierModel = models?.tiers.find((tier) => tier.id === route.model_tier)?.model ?? '';
  const declared = frontmatterValue(agentText, 'model');
  if (tierModel === '' || tierModel !== declared) {
    return [
      result('C18', C18_TITLE, [
        finding('C18', 'tier-model-mismatch', `${orNone(tierModel)}!=${orNone(declared)}`),
      ]),
    ];
  }
  return [result('C18', C18_TITLE, [])];
}

// The router reaches the kernel through ONE subcommand, `resolve`, whose answer
// is selected by the facts it declares. The literal to defend is therefore not
// five subcommand names but the single call plus the facts a plan cannot be
// built without: the escalation form, the risk signals, the per-unit work type
// and the wave layering.
interface RequiredFact {
  readonly subject: string;
  readonly literal: string;
}

const REQUIRED_KERNEL_FACTS: readonly RequiredFact[] = [
  { subject: 'resolve-call', literal: 'kernel.sh resolve --facts' },
  { subject: 'escalate', literal: '"escalate": true' },
  { subject: 'signals', literal: '"signals"' },
  { subject: 'workType', literal: '"workType"' },
  { subject: 'waves', literal: '"waves"' },
];

function checkC18b(ctx: CheckContext): CheckResult[] {
  if (missingInputs(ctx, ROUTER_INPUTS)) return skipOnce(ctx, 'C18b', C18B_TITLE, ROUTER_TOKEN);
  const agentText = ctx.readText(ROUTER_MD);
  if (agentText === undefined) return skipOnce(ctx, 'C18b', C18B_TITLE, ROUTER_AGENT_TOKEN);
  // The literals carry spaces and quotes, so the SUBJECT is a slug naming the
  // fact rather than the grep string: a finding renders on one line.
  const findings = REQUIRED_KERNEL_FACTS.filter((fact) => !agentText.includes(fact.literal)).map((fact) =>
    finding('C18b', 'kernel-fact-missing', fact.subject),
  );
  return [result('C18b', C18B_TITLE, findings)];
}

// Read-only planner by tool absence, not by prompt discipline: the autonomy
// ceiling is enforced by the tools the agent does not hold.
const FORBIDDEN_TOOLS: readonly string[] = ['Edit', 'Write', 'Task'];

function checkC18c(ctx: CheckContext): CheckResult[] {
  if (missingInputs(ctx, ROUTER_INPUTS)) return skipOnce(ctx, 'C18c', C18C_TITLE, ROUTER_TOKEN);
  const agentText = ctx.readText(ROUTER_MD);
  if (agentText === undefined) return skipOnce(ctx, 'C18c', C18C_TITLE, ROUTER_AGENT_TOKEN);
  const tools = frontmatterValue(agentText, 'tools');
  const findings: Finding[] = [];
  // Substring, not a parsed list: that is what the bash grep did, and a tool
  // name embedded in a longer one is exactly the case a parser would let past.
  if (!tools.includes('Bash')) findings.push(finding('C18c', 'bash-tool-missing', 'Bash'));
  for (const tool of FORBIDDEN_TOOLS) {
    if (tools.includes(tool)) findings.push(finding('C18c', 'forbidden-tool', tool));
  }
  return [result('C18c', C18C_TITLE, findings)];
}

// Behavioural and fixture-driven, the same self-validating shape routing.json's
// sample_path has. `intents` is compared alongside escalate and reasons because
// escalate=false with reasons=[] is ALSO what total routing failure looks like:
// a fixture matching zero intents passed for years on that pair alone.
function checkC18e(ctx: CheckContext): CheckResult[] {
  if (missingInputs(ctx, ROUTER_INPUTS)) return skipOnce(ctx, 'C18e', C18E_TITLE, ROUTER_TOKEN);
  const policy = loadedOr(() => ctx.registries.policy);
  if (policy === undefined) return [preconditionResult('C18e', C18E_TITLE, POLICY_JSON)];
  const findings: Finding[] = [];
  policy.router.fixtures.forEach((fixture, index) => {
    const at = String(index);
    const answer = kernelAnswer(ctx, ['route-escalate', '--prompt', fixture.prompt]);
    if (answer?.['escalate'] !== fixture.escalate) {
      findings.push(finding('C18e', 'fixture-escalate-mismatch', at));
    }
    if (!sameList(sorted(stringsOf(answer?.['reasons'])), sorted(fixture.reasons))) {
      findings.push(finding('C18e', 'fixture-reasons-mismatch', at));
    }
    if (!sameList(sorted(stringsOf(answer?.['intents'])), sorted(fixture.intents))) {
      findings.push(finding('C18e', 'fixture-intents-mismatch', at));
    }
  });
  return [result('C18e', C18E_TITLE, findings)];
}

// The hot path is one registered adapter and one deep kernel call. Two files,
// because the adapter is a shim: hooks.json registers the node form, but a
// consumer who copied the old entry still executes hooks/prompt-advisor.sh by
// path — so the registration half reads the shim and its mode bit, while the
// resolve-task call lives in the TypeScript module that owns it.
function checkC18f(ctx: CheckContext): CheckResult[] {
  if (missingInputs(ctx, ROUTER_INPUTS)) return skipOnce(ctx, 'C18f', C18F_TITLE, ROUTER_TOKEN);
  const findings: Finding[] = [];
  // `=== false`, not falsy: `null` means the filesystem cannot represent the
  // mode, which is not evidence that the adapter is unexecutable.
  if (isExecutable(ctx, PROMPT_ADVISOR) === false) {
    findings.push(finding('C18f', 'adapter-not-executable', PROMPT_ADVISOR));
  }
  const commands = rows(subRecord(rawJson(ctx, HOOKS_JSON), 'hooks'), 'UserPromptSubmit')
    .flatMap((entry) => rows(entry, 'hooks'))
    .map((hook) => hook['command'])
    .filter((command): command is string => typeof command === 'string');
  // Exactly one: a second registered pass would run the advisor twice per turn.
  if (commands.length !== 1 || !(commands[0] ?? '').includes('prompt-advisor')) {
    findings.push(finding('C18f', 'registration-not-single-adapter', HOOKS_JSON));
  }
  if (!(ctx.readText(PROMPT_ADVISOR_TS) ?? '').includes('resolve-task')) {
    findings.push(finding('C18f', 'resolve-task-call-missing', PROMPT_ADVISOR_TS));
  }
  findings.push(...hookTargetFindings(ctx));
  return [result('C18f', C18F_TITLE, findings)];
}

// `"${CLAUDE_PLUGIN_ROOT}/<path>"` in a hooks.json command: the script the
// harness runs, relative to the plugin root.
const PLUGIN_SCRIPT = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"'\s]+)/g;
// The bundle a generated dist/ loader requires (scripts/build.mjs loaderText).
const LOADER_REQUIRE = /require\('\.\/(runtime\/[^'\s]+)'\)/g;
const DIST_PREFIX = 'dist/';

// A hooks.json row whose script is not in the tree fails every event it is
// registered on, git-write-guard included: node exits non-zero, the harness
// logs it, and the hook never ran. A committed loader is followed one step to
// the dist/runtime bundle it requires, since a loader without its bundle fails
// the same way.
function hookTargetFindings(ctx: CheckContext): Finding[] {
  const events = subRecord(rawJson(ctx, HOOKS_JSON), 'hooks');
  const commands = Object.keys(events ?? {})
    .flatMap((event) => rows(events, event))
    .flatMap((group) => rows(group, 'hooks'))
    .map((hook) => hook['command'])
    .filter((command): command is string => typeof command === 'string');
  const targets = uniqueSorted(commands.flatMap((command) => captures(command, PLUGIN_SCRIPT)));
  const missing: string[] = [];
  for (const target of targets) {
    if (!inTree(target) || !ctx.exists(target)) {
      missing.push(target);
      continue;
    }
    if (!target.startsWith(DIST_PREFIX)) continue;
    const required = captures(ctx.readText(target) ?? '', LOADER_REQUIRE).map((bundle) => `${DIST_PREFIX}${bundle}`);
    missing.push(...required.filter((bundle) => !inTree(bundle) || !ctx.exists(bundle)));
  }
  return uniqueSorted(missing).map((path) => finding('C18f', 'hook-target-missing', path));
}

function captures(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined && value !== '');
}

// Relative, forward-slash, no `..` segment: a path that leaves the plugin root
// cannot be "in the tree", whatever happens to exist there.
function inTree(path: string): boolean {
  return !path.startsWith('/') && !path.includes('\\') && !path.split('/').includes('..');
}

// Substantive routes receive the complete transitive policy closure; pure
// questions do not pay for it. Two independent declarations of the bundle are
// compared: src/lib/deferrals.ts's TASK_CONTRACT_RULES (what a router row need
// not name because the contract supplies it) against what resolve-task answers.
const SUBSTANTIVE_PROBE = 'update the prose in this document';
const PURE_PROBE = 'what is the weather';
// Added by the agent half of the closure, not the substantive half, so it is
// excluded before the comparison exactly as the bash jq filter excluded it.
const AGENT_POLICY_RULE = 'subagents';

function checkC18g(ctx: CheckContext): CheckResult[] {
  if (missingInputs(ctx, ROUTER_INPUTS)) return skipOnce(ctx, 'C18g', C18G_TITLE, ROUTER_TOKEN);
  const got = policyRulesFor(ctx, SUBSTANTIVE_PROBE).filter((rule) => rule !== AGENT_POLICY_RULE);
  const want = uniqueSorted(TASK_CONTRACT_RULES);
  const drift = [...want.filter((rule) => !got.includes(rule)), ...got.filter((rule) => !want.includes(rule))];
  const findings: Finding[] = uniqueSorted(drift).map((rule) => finding('C18g', 'policy-closure-drift', rule));
  const pure = policyRulesFor(ctx, PURE_PROBE);
  if (pure.length !== 0) findings.push(finding('C18g', 'pure-question-not-lean', String(pure.length)));
  return [result('C18g', C18G_TITLE, findings)];
}

function policyRulesFor(ctx: CheckContext, prompt: string): string[] {
  const answer = kernelAnswer(ctx, ['resolve-task', '--prompt', prompt]);
  return uniqueSorted(stringsOf(subRecord(answer, 'task_contract')?.['policy_rules']));
}

function orNone(value: string | undefined): string {
  return value === undefined || value === '' ? 'none' : value;
}

export const ROUTER_CHECKS: readonly Check[] = [
  { id: 'C18', codes: C18_FINDINGS, run: checkC18 },
  { id: 'C18b', codes: C18B_FINDINGS, run: checkC18b },
  { id: 'C18c', codes: C18C_FINDINGS, run: checkC18c },
  SUPPRESSION_CHECK,
  { id: 'C18e', codes: C18E_FINDINGS, run: checkC18e },
  { id: 'C18f', codes: C18F_FINDINGS, run: checkC18f },
  { id: 'C18g', codes: C18G_FINDINGS, run: checkC18g },
];
