import { KernelError } from '../lib/json';
import type { BreakerPolicy } from '../registry/policy';
import type { Registries } from './context';

// Per-resource circuit breaker. The failure policy (rules/parallelism.md) asks
// "try this UNIT again?"; breaker asks "why are we still calling this
// RESOURCE?". The orchestrator owns the state and the consecutive-failure count
// (from the exec journal) and passes them in — the kernel is the transition
// table, nothing more. rules/parallelism.md "Circuit breaker" mirrors it; C25
// guards both.
//
// Which fact each state needs is the state's own business, exactly as in the
// bash arm: `closed` requires `failures`, `open` requires `cooldownElapsed`,
// `half-open` requires `probeResult`. A fact the current state does not read is
// ignored rather than validated.
export interface BreakerFacts {
  state: string;
  failures?: number;
  cooldownElapsed?: boolean;
  probeResult?: string;
}

// cmd_breaker's key order: state, allow, reason.
export interface BreakerSection {
  state: string;
  allow: boolean;
  reason: string;
}

type Transition = (facts: BreakerFacts, breaker: BreakerPolicy) => BreakerSection;

// The registry declares WHICH states exist (policy.breaker.states); this table
// declares how each one transitions. A state in one and not the other has no
// answer, so the guard below reads both — neither list is a restatement of the
// other.
const TRANSITIONS: Record<string, Transition> = {
  closed: fromClosed,
  open: fromOpen,
  'half-open': fromHalfOpen,
};

export function breakerSection(facts: BreakerFacts, regs: Registries): BreakerSection {
  const breaker = regs.policy.breaker;
  const transition = TRANSITIONS[facts.state];
  if (transition === undefined || !breaker.states.includes(facts.state)) {
    // The bash message, verbatim. It names the three states the transition
    // table implements rather than joining policy.breaker.states, whose order
    // is the registry's and would drift from the answer callers already parse.
    throw new KernelError('breaker requires --state closed|open|half-open');
  }
  return transition(facts, breaker);
}

function fromClosed(facts: BreakerFacts, breaker: BreakerPolicy): BreakerSection {
  const failures = facts.failures;
  if (failures === undefined || !Number.isInteger(failures) || failures < 0) {
    throw new KernelError('breaker --state closed requires a numeric --failures');
  }
  if (failures >= breaker.failure_threshold) {
    return {
      state: 'open',
      allow: false,
      reason: `${failures} consecutive failures reached threshold ${breaker.failure_threshold} — stop calling this resource for ${breaker.cooldown_waves} wave(s); route around or report DEGRADED`,
    };
  }
  return {
    state: 'closed',
    allow: true,
    reason: `${failures} of ${breaker.failure_threshold} failures — resource healthy`,
  };
}

function fromOpen(facts: BreakerFacts, breaker: BreakerPolicy): BreakerSection {
  const elapsed = facts.cooldownElapsed;
  if (elapsed === undefined) {
    throw new KernelError('breaker --state open requires --cooldown-elapsed true|false');
  }
  if (elapsed) {
    return {
      state: 'half-open',
      allow: true,
      reason: `cooldown elapsed — allow ${breaker.half_open_probes} probe call(s); no fan-out through this resource until it closes`,
    };
  }
  return {
    state: 'open',
    allow: false,
    reason: 'cooldown not elapsed — do not call; route around or report DEGRADED',
  };
}

function fromHalfOpen(facts: BreakerFacts): BreakerSection {
  const probe = facts.probeResult;
  if (probe !== 'ok' && probe !== 'failed') {
    throw new KernelError('breaker --state half-open requires --probe-result ok|failed');
  }
  if (probe === 'ok') {
    return {
      state: 'closed',
      allow: true,
      reason: 'probe succeeded — resource recovered; reset the failure count to 0',
    };
  }
  return { state: 'open', allow: false, reason: 'probe failed — reopen for another cooldown' };
}
