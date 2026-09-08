// Family 50-kernel, first half: the kernel's path resolver and the routing
// fixtures that validate it (C17*). The router-agent half (C18*) lives in
// kernel-router.ts; KERNEL_CHECKS below is the whole family.
//
// These are behavioural checks. routing.json carries the patterns AND a
// self-validating sample_path per domain, so the registry proves its own
// patterns instead of a Check re-grepping a hand-written case ladder.
// Spec: docs/specs/2026-08-06-decision-kernel-p2-resolver-api.md
import { compilePromptRegex } from '../kernel/scale';
import { KernelError } from '../lib/json';
import { finding, result, type CheckResult, type Finding } from './findings';
import type { Check } from './index';
import {
  KERNEL_INPUTS,
  KERNEL_TOKEN,
  kernelAnswer,
  loadedOr,
  missingInputs,
  preconditionResult,
  rawJson,
  subRecord,
} from './kernel-lib';
import { ROUTER_CHECKS } from './kernel-router';
import { skipOnce, type CheckContext } from './lib';

export const C17_FINDINGS = ['no-patterns', 'no-sample'] as const;
export const C17B_FINDINGS = ['sample-routes-elsewhere'] as const;
export const C17C_FINDINGS = ['excluded-path-routed', 'foreign-path-excluded'] as const;
export const C17E_FINDINGS = ['signal-missing', 'signal-invalid-regex'] as const;

declare module './codes' {
  interface CheckCodes {
    C17: (typeof C17_FINDINGS)[number];
    C17b: (typeof C17B_FINDINGS)[number];
    C17c: (typeof C17C_FINDINGS)[number];
    C17e: (typeof C17E_FINDINGS)[number];
  }
}

const ROUTING_JSON = 'registries/routing.json';
const POLICY_JSON = 'registries/policy.json';

const C17_TITLE = 'every routing domain declares match patterns and a sample_path';
const C17B_TITLE = 'every domain sample_path routes to its own domain via the kernel';
const C17C_TITLE = 'kernel route-path honors the excluded patterns and self_dirs';
const C17E_TITLE = 'policy.json prompt_signals present and valid EREs';

function checkC17(ctx: CheckContext): CheckResult[] {
  if (missingInputs(ctx, KERNEL_INPUTS)) return skipOnce(ctx, 'C17', C17_TITLE, KERNEL_TOKEN);
  const routing = loadedOr(() => ctx.registries.routing);
  if (routing === undefined) return [preconditionResult('C17', C17_TITLE, ROUTING_JSON)];
  const findings: Finding[] = [];
  for (const domain of routing.domains) {
    // Path globs and basename globs are one pool: a domain matched by either is
    // reachable, and a domain matched by neither can never be routed to.
    if (domain.match.paths.length + domain.match.basenames.length === 0) {
      findings.push(finding('C17', 'no-patterns', domain.id));
    }
    // jq read `.sample_path // empty`, so a null, an absent key and an empty
    // string were one answer: no fixture to validate the patterns with.
    if (domain.sample_path === null || domain.sample_path === '') {
      findings.push(finding('C17', 'no-sample', domain.id));
    }
  }
  return [result('C17', C17_TITLE, findings)];
}

// The fixture half of C17: a sample_path must route to the domain that declares
// it, which validates the patterns AND the precedence chain — a domain shadowed
// by an earlier one fails here even though its own globs are correct.
function checkC17b(ctx: CheckContext): CheckResult[] {
  if (missingInputs(ctx, KERNEL_INPUTS)) return skipOnce(ctx, 'C17b', C17B_TITLE, KERNEL_TOKEN);
  const routing = loadedOr(() => ctx.registries.routing);
  if (routing === undefined) return [preconditionResult('C17b', C17B_TITLE, ROUTING_JSON)];
  const findings: Finding[] = [];
  for (const domain of routing.domains) {
    const answer = kernelAnswer(ctx, ['route-path', domain.sample_path ?? '']);
    const got = answer?.['domain'];
    const routed = typeof got === 'string' ? got : 'null';
    if (routed !== domain.id) {
      // The subject carries where it went instead, which is the whole diagnostic:
      // "dba->frontend" says the sample is shadowed, "dba->null" says it matches
      // nothing at all.
      findings.push(finding('C17b', 'sample-routes-elsewhere', `${domain.id}->${routed}`));
    }
  }
  return [result('C17b', C17B_TITLE, findings)];
}

// Three paths that must be excluded and one that must not. The fourth is the
// point of the check: `self_dirs` is resolved against THIS checkout's root, so a
// consumer project's own hooks/ tree still routes normally.
interface Probe {
  readonly subject: string;
  readonly path: string;
}

function checkC17c(ctx: CheckContext): CheckResult[] {
  if (missingInputs(ctx, KERNEL_INPUTS)) return skipOnce(ctx, 'C17c', C17C_TITLE, KERNEL_TOKEN);
  const excluded: readonly Probe[] = [
    { subject: 'engineos-dir', path: '/tmp/some-repo/.engineos/changes/x.ts' },
    { subject: 'markdown', path: '/tmp/some-repo/README.md' },
    { subject: 'self-hooks', path: `${ctx.root}/hooks/x.sh` },
  ];
  const findings: Finding[] = [];
  for (const probe of excluded) {
    if (excludedFor(ctx, probe.path) !== true) {
      findings.push(finding('C17c', 'excluded-path-routed', probe.subject));
    }
  }
  const foreign: Probe = { subject: 'foreign-hooks', path: '/tmp/some-repo/hooks/x.ts' };
  if (excludedFor(ctx, foreign.path) !== false) {
    findings.push(finding('C17c', 'foreign-path-excluded', foreign.subject));
  }
  return [result('C17c', C17C_TITLE, findings)];
}

// An invalid expression here makes `kernel scale` silently mis-answer, which is
// how a gate disappears without anything going red. Read from the raw document
// rather than the typed loader: the loader refuses the WHOLE registry when one
// key is absent, and this check has to say WHICH key.
const PROMPT_SIGNAL_KEYS: readonly string[] = [
  'action',
  'substantive_action',
  'scale',
  'spec',
  'design_strong',
  'design_weak',
];

function checkC17e(ctx: CheckContext): CheckResult[] {
  if (missingInputs(ctx, KERNEL_INPUTS)) return skipOnce(ctx, 'C17e', C17E_TITLE, KERNEL_TOKEN);
  const signals = subRecord(subRecord(rawJson(ctx, POLICY_JSON), 'parallelism'), 'prompt_signals');
  const findings: Finding[] = [];
  for (const key of PROMPT_SIGNAL_KEYS) {
    const source = signals?.[key];
    if (typeof source !== 'string' || source === '') {
      findings.push(finding('C17e', 'signal-missing', key));
      continue;
    }
    // The kernel's own compiler, not a second opinion about it: a pattern this
    // check accepts and src/kernel/scale.ts rejects would be a green validator
    // over a kernel that throws on the next prompt.
    try {
      compilePromptRegex(source, key);
    } catch (e) {
      if (!(e instanceof KernelError)) throw e;
      findings.push(finding('C17e', 'signal-invalid-regex', key));
    }
  }
  return [result('C17e', C17E_TITLE, findings)];
}

function excludedFor(ctx: CheckContext, path: string): boolean | undefined {
  const value = kernelAnswer(ctx, ['route-path', path])?.['excluded'];
  return typeof value === 'boolean' ? value : undefined;
}

export const KERNEL_CHECKS: readonly Check[] = [
  { id: 'C17', codes: C17_FINDINGS, run: checkC17 },
  { id: 'C17b', codes: C17B_FINDINGS, run: checkC17b },
  { id: 'C17c', codes: C17C_FINDINGS, run: checkC17c },
  { id: 'C17e', codes: C17E_FINDINGS, run: checkC17e },
  ...ROUTER_CHECKS,
];
