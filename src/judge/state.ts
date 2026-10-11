// Builds the `state` object sent to Jev (contracts.md@rev1 §10.2): only the
// redacted request text, the repository facts and the session's last intent —
// nothing else from the environment ever reaches the request body.
import { redactBounded } from './redact';
import type { JudgeInput, JudgePolicy, JudgeState } from './types';

export type StateResult = { kind: 'ok'; state: JudgeState } | { kind: 'oversize' };

// The prompt is pre-capped before redaction (D3): the state can never carry
// more than max_state_bytes of text, and every character takes at least one
// byte, so twice that many characters is all redaction ever needs to see.
const PRE_CAP_FACTOR = 2;

export function buildJudgeState(input: JudgeInput, policy: JudgePolicy): StateResult {
  const { text, capped } = redactBounded(input.text, policy.redaction.patterns, PRE_CAP_FACTOR * policy.max_state_bytes);
  const full = stateWith(input, text, capped);
  if (byteLength(full) <= policy.max_state_bytes) return { kind: 'ok', state: full };
  return truncateToFit(input, text, policy.max_state_bytes);
}

// Cuts request.text at a code-point boundary (never inside a UTF-8 sequence or
// a surrogate pair) to the longest prefix whose serialized state still fits.
// Redaction already ran on the whole pre-capped prefix, so a cut can never
// expose part of a secret that the prefix would have hidden.
function truncateToFit(input: JudgeInput, text: string, maxBytes: number): StateResult {
  const codePoints = Array.from(text);
  if (byteLength(stateWith(input, '', true)) > maxBytes) return { kind: 'oversize' };
  let low = 0;
  let high = codePoints.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (byteLength(stateWith(input, codePoints.slice(0, mid).join(''), true)) <= maxBytes) low = mid;
    else high = mid - 1;
  }
  return { kind: 'ok', state: stateWith(input, codePoints.slice(0, low).join(''), true) };
}

function stateWith(input: JudgeInput, text: string, truncated: boolean): JudgeState {
  return {
    request: truncated ? { text, source: 'user', truncated: true } : { text, source: 'user' },
    repository: {
      declared_stack: [...input.repository.declared_stack],
      active_spec: input.repository.active_spec,
      open_change_record: input.repository.open_change_record,
    },
    session: { last_intent: input.session.last_intent },
  };
}

function byteLength(state: JudgeState): number {
  return Buffer.byteLength(JSON.stringify(state), 'utf8');
}
