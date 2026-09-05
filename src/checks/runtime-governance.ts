// The runtime-governance family: the runtime's own policy plumbing, ported from
// scripts/checks/70-runtime.sh lines 1-832 (plan Task 40). Nineteen checks over
// six prose/data pairs — the check-level repair loop (C20*), kernel-decision
// telemetry (C22*), the constitution preamble (C23*), the dispatch loop's
// backpressure (C24*), the per-resource circuit breaker (C25*) and
// human-in-the-loop (C26*).
//
// Each part file declares its own code lists beside its checks and augments
// CheckCodes there; this file only assembles the registry entries, so a family
// member is added in one place and typed in one place.
import type { Check } from './index';
import {
  C20_FINDINGS,
  C20B_FINDINGS,
  C20C_FINDINGS,
  C20D_FINDINGS,
  checkC20,
  checkC20b,
  checkC20c,
  checkC20d,
} from './runtime-governance-repair';
import {
  C22_FINDINGS,
  C22B_FINDINGS,
  C22C_FINDINGS,
  checkC22,
  checkC22b,
  checkC22c,
} from './runtime-governance-telemetry';
import { C23_FINDINGS, C23C_FINDINGS, checkC23, checkC23c } from './runtime-governance-constitution';
import {
  C24_FINDINGS,
  C24B_FINDINGS,
  C24C_FINDINGS,
  checkC24,
  checkC24b,
  checkC24c,
} from './runtime-governance-backpressure';
import {
  C25_FINDINGS,
  C25B_FINDINGS,
  C25C_FINDINGS,
  checkC25,
  checkC25b,
  checkC25c,
} from './runtime-governance-breaker';
import {
  C26_FINDINGS,
  C26C_FINDINGS,
  C26D_FINDINGS,
  checkC26,
  checkC26c,
  checkC26d,
} from './runtime-governance-hitl';
import { C26B_FINDINGS, checkC26b } from './runtime-governance-hitl-canary';

export {
  C20_FINDINGS,
  C20B_FINDINGS,
  C20C_FINDINGS,
  C20D_FINDINGS,
  C22_FINDINGS,
  C22B_FINDINGS,
  C22C_FINDINGS,
  C23_FINDINGS,
  C23C_FINDINGS,
  C24_FINDINGS,
  C24B_FINDINGS,
  C24C_FINDINGS,
  C25_FINDINGS,
  C25B_FINDINGS,
  C25C_FINDINGS,
  C26_FINDINGS,
  C26B_FINDINGS,
  C26C_FINDINGS,
  C26D_FINDINGS,
};

// Registration order is the bash file's order; orderIds sorts what the harness
// runs and lists, so this is documentation rather than behaviour.
export const RUNTIME_GOVERNANCE_CHECKS: readonly Check[] = [
  { id: 'C20', codes: C20_FINDINGS, run: checkC20 },
  { id: 'C20b', codes: C20B_FINDINGS, run: checkC20b },
  { id: 'C20c', codes: C20C_FINDINGS, run: checkC20c },
  { id: 'C20d', codes: C20D_FINDINGS, run: checkC20d },
  { id: 'C22', codes: C22_FINDINGS, run: checkC22 },
  { id: 'C22b', codes: C22B_FINDINGS, run: checkC22b },
  { id: 'C22c', codes: C22C_FINDINGS, run: checkC22c },
  { id: 'C23', codes: C23_FINDINGS, run: checkC23 },
  { id: 'C23c', codes: C23C_FINDINGS, run: checkC23c },
  { id: 'C24', codes: C24_FINDINGS, run: checkC24 },
  { id: 'C24b', codes: C24B_FINDINGS, run: checkC24b },
  { id: 'C24c', codes: C24C_FINDINGS, run: checkC24c },
  { id: 'C25', codes: C25_FINDINGS, run: checkC25 },
  { id: 'C25b', codes: C25B_FINDINGS, run: checkC25b },
  { id: 'C25c', codes: C25C_FINDINGS, run: checkC25c },
  { id: 'C26', codes: C26_FINDINGS, run: checkC26 },
  { id: 'C26b', codes: C26B_FINDINGS, run: checkC26b },
  { id: 'C26c', codes: C26C_FINDINGS, run: checkC26c },
  { id: 'C26d', codes: C26D_FINDINGS, run: checkC26d },
];
