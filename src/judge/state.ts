// Builds the `state` object sent to Jev (contracts.md@rev1 §10.2): only the
// redacted request text, the repository facts and the session's last intent —
// nothing else from the environment ever reaches the request body.
import { redactText } from './redact';
import type { JudgeInput, JudgePolicy, JudgeState } from './types';

export type StateResult = { kind: 'ok'; state: JudgeState } | { kind: 'oversize' };

export function buildJudgeState(input: JudgeInput, policy: JudgePolicy): StateResult {
  const text = redactText(input.text, policy.redaction.patterns);
  const full = stateWith(input, text, false);
  if (byteLength(full) <= policy.max_state_bytes) return { kind: 'ok', state: full };
  return truncateToFit(input, text, policy.max_state_bytes);
}

// Cuts request.text at a code-point boundary (never inside a UTF-8 sequence or
// a surrogate pair) to the longest prefix whose serialized state still fits.
// Redaction already ran on the whole text, so a cut can never expose part of a
// secret that the full text would have hidden.
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
