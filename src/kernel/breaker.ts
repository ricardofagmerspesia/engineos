import { KernelError } from '../lib/json';
import type { BreakerPolicy } from '../registry/policy';
import type { Registries } from './context';
import { fillTemplate, type Fact } from './table';
import { leaves, step } from './transitions';

// Per-resource circuit breaker. The failure policy (rules/parallelism.md) asks
// "try this UNIT again?"; breaker asks "why are we still calling this
// RESOURCE?". The orchestrator owns the state and the consecutive-failure count
// (from the exec journal) and passes them in — the kernel runs the transition
// table in registries/policy.json .breaker.transitions, nothing more.
// rules/parallelism.md "Circuit breaker" mirrors it; C25 guards both.
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

// How each state measures its guard fact, with the verbatim refusal when the
// caller did not supply it. Where the state goes, whether the call is allowed
// and the prose are policy.breaker.transitions rows; a state needs a reader
// here, a declaration in policy.breaker.states and edges in the table.
interface GuardReader {
  // The guard facts `read` supplies: the vocabulary C25 holds this state's
  // edges in policy.breaker.transitions to.
  readonly facts: readonly string[];
  read(facts: BreakerFacts, breaker: BreakerPolicy): Record<string, Fact>;
}

export const BREAKER_GUARDS: Readonly<Record<string, GuardReader>> = {
  closed: {
    facts: ['threshold_reached'],
    read: (facts, breaker) => {
      const failures = facts.failures;
      if (failures === undefined || !Number.isInteger(failures) || failures < 0) {
        throw new KernelError('breaker --state closed requires a numeric --failures');
      }
      return { threshold_reached: failures >= breaker.failure_threshold };
    },
  },
  open: {
    facts: ['cooldown_elapsed'],
    read: (facts) => {
      const elapsed = facts.cooldownElapsed;
      if (elapsed === undefined) {
        throw new KernelError('breaker --state open requires --cooldown-elapsed true|false');
      }
      return { cooldown_elapsed: elapsed };
    },
  },
  'half-open': {
    facts: ['probe_result'],
    read: (facts) => {
      const probe = facts.probeResult;
      if (probe !== 'ok' && probe !== 'failed') {
        throw new KernelError('breaker --state half-open requires --probe-result ok|failed');
      }
      return { probe_result: probe };
    },
  },
};

// The slots transition prose may use; C25 rejects any other.
export const BREAKER_PLACEHOLDERS = ['failures', 'failure_threshold', 'cooldown_waves', 'half_open_probes'] as const;

export function breakerSection(facts: BreakerFacts, regs: Registries): BreakerSection {
  const breaker = regs.policy.breaker;
  const guard = Object.prototype.hasOwnProperty.call(BREAKER_GUARDS, facts.state) ? BREAKER_GUARDS[facts.state] : undefined;
  if (guard === undefined || !breaker.states.includes(facts.state) || !leaves(breaker.transitions, facts.state)) {
    // The bash message, verbatim. It names the three states the readers
    // implement rather than joining policy.breaker.states, whose order is the
    // registry's and would drift from the answer callers already parse.
    throw new KernelError('breaker requires --state closed|open|half-open');
  }
  const edge = step(breaker.transitions, facts.state, { facts: guard.read(facts, breaker) });
  return { state: edge.to, allow: edge.allow, reason: fillTemplate(edge.reason, slots(facts, breaker)) };
}

// `failures` is a slot only when the caller passed it: an edge whose prose
// names it from a state that never asked for it throws instead of rendering.
function slots(facts: BreakerFacts, breaker: BreakerPolicy): Record<string, number> {
  const values: Record<string, number> = {
    failure_threshold: breaker.failure_threshold,
    cooldown_waves: breaker.cooldown_waves,
    half_open_probes: breaker.half_open_probes,
  };
  if (facts.failures !== undefined) values['failures'] = facts.failures;
  return values;
}
