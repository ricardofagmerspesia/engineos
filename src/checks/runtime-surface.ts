// Family `runtime-surface`: the second half of scripts/checks/70-runtime.sh —
// the agent-span exec journal (C27*), the retrieval-metrics prose/data pair
// (C28), the adoption entrypoints (C29) and the hook file modes the harness
// executes through (C30).
//
// The checks themselves live one file per concern so no file carries two
// unrelated rationales; this module is the registry and the single home of the
// code-list augmentation. C27e and C27f are gone with the bash constants they
// compared (design deviations 4 and 6) and are not resurrected here.
import type { Check } from './index';
import { C27b_FINDINGS, checkC27b } from './runtime-surface-canary';
import { C28_FINDINGS, C29_FINDINGS, checkC28, checkC29 } from './runtime-surface-adoption';
import { C27_FINDINGS, C27d_FINDINGS, checkC27, checkC27d } from './runtime-surface-journal';
import { C30_FINDINGS, checkC30 } from './runtime-surface-modes';
import { C27c_FINDINGS, checkC27c } from './runtime-surface-wiring';

export {
  C27_FINDINGS, C27d_FINDINGS, C27b_FINDINGS, C27c_FINDINGS,
  C28_FINDINGS, C29_FINDINGS, C30_FINDINGS,
};

declare module './codes' {
  interface CheckCodes {
    C27: typeof C27_FINDINGS[number];
    C27b: typeof C27b_FINDINGS[number];
    C27c: typeof C27c_FINDINGS[number];
    C27d: typeof C27d_FINDINGS[number];
    C28: typeof C28_FINDINGS[number];
    C29: typeof C29_FINDINGS[number];
    C30: typeof C30_FINDINGS[number];
  }
}

export const RUNTIME_SURFACE_CHECKS: readonly Check[] = [
  { id: 'C27', codes: C27_FINDINGS, run: checkC27 },
  { id: 'C27b', codes: C27b_FINDINGS, run: checkC27b },
  { id: 'C27c', codes: C27c_FINDINGS, run: checkC27c },
  { id: 'C27d', codes: C27d_FINDINGS, run: checkC27d },
  { id: 'C28', codes: C28_FINDINGS, run: checkC28 },
  { id: 'C29', codes: C29_FINDINGS, run: checkC29 },
  { id: 'C30', codes: C30_FINDINGS, run: checkC30 },
];
