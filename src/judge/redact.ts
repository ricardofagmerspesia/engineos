// Secret redaction applied to the prompt before it enters the judge `state`
// (contracts.md@rev1 §6.2, §10.2). The patterns are registry data
// (policy.judge.redaction.patterns), the same set install.sh scans for; this
// module only applies them, in list order, so an earlier, more specific kind
// (sk-ant-) wins over a later, broader one (sk-).
import type { RedactionPattern } from './types';

export class RedactionPatternError extends Error {
  readonly kind = 'judge-redaction-pattern';
}

export function redactText(text: string, patterns: readonly RedactionPattern[]): string {
  let redacted = text;
  for (const { kind, pattern } of patterns) {
    redacted = redacted.replace(compile(kind, pattern), `<redacted:${kind}>`);
  }
  return redacted;
}

// Compiled per call: a shared /g RegExp carries lastIndex between uses, and the
// strict loader already proved each source compiles, so the cost is a dozen
// small compilations once per user prompt.
function compile(kind: string, pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'g');
  } catch {
    // The message names the kind only; the pattern source is policy data, but a
    // malformed one is reported by the loader with its JSON path already.
    throw new RedactionPatternError(`redaction pattern '${kind}' does not compile`);
  }
}
