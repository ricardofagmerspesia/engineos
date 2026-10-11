// Jev judge client (contracts.md@rev1 §10). One POST per user prompt, opt-in
// only, no retry, hard deadline, breaker-guarded. Nothing here touches the
// network on its own: `fetch` arrives through JudgeDeps, so the module is inert
// until a caller (T05's prompt advisor) injects a transport, and no live call is
// made before T13's recorded human decision (decision D5).
//
// Sensitive-data boundary: the request body is built from exactly three keys
// ({ model, state, questions }); `state` holds the redacted prompt and nothing
// from the environment. The API key goes into the Authorization header only and
// never into an outcome, an error or a log line.
import { parseJevResponse } from './response';
import { buildJudgeState } from './state';
import type { FailedReason, JudgeDeps, JudgeInput, JudgeOutcome, JudgePolicy, SkippedReason } from './types';

type Admission =
  | { kind: 'go'; key: string; transport: typeof globalThis.fetch }
  | { kind: 'skipped'; reason: SkippedReason };

type Exchange = { kind: 'json'; raw: unknown } | { kind: 'failed'; reason: FailedReason };

export async function judge(input: JudgeInput, deps: JudgeDeps): Promise<JudgeOutcome> {
  const admission = admit(input, deps);
  if (admission.kind === 'skipped') return admission;

  // Oversize is a property of this prompt, not of the provider's health, so it
  // fails without counting against the breaker.
  const built = buildJudgeState(input, deps.policy);
  if (built.kind === 'oversize') return { kind: 'failed', reason: 'oversize-state' };

  const body = JSON.stringify({ model: deps.policy.model, state: built.state, questions: deps.questions });
  const startedAt = deps.now();
  const exchange = await exchangeWithDeadline(admission.transport, admission.key, body, deps.policy);
  const latencyMs = deps.now() - startedAt;

  if (exchange.kind === 'failed') return fail(exchange.reason, deps);
  const facts = parseJevResponse(exchange.raw, deps.questions, latencyMs);
  if (facts === null) return fail('invalid-response', deps);
  deps.breaker.recordSuccess();
  return { kind: 'facts', facts };
}

// Enablement order, first hit wins (contracts §10.1). Only the last step reads
// the breaker file, so a disabled judge never touches disk or network.
function admit(input: JudgeInput, deps: JudgeDeps): Admission {
  const { policy, env } = deps;
  if (input.source !== 'user') return { kind: 'skipped', reason: 'not-user-input' };
  if (env[policy.enabled_env] !== policy.enabled_value) return { kind: 'skipped', reason: 'disabled' };
  const key = env[policy.key_env];
  if (key === undefined || key.trim() === '') return { kind: 'skipped', reason: 'no-key' };
  if (deps.fetch === undefined) return { kind: 'skipped', reason: 'no-fetch' };
  const breaker = deps.breaker.read();
  // Half-open: once the cooldown has elapsed one probe proceeds; its outcome
  // closes (recordSuccess) or re-opens (recordFailure re-stamps opened_at).
  if (breaker.opened_at !== null && deps.now() - breaker.opened_at < policy.breaker.cooldown_ms) {
    return { kind: 'skipped', reason: 'breaker-open' };
  }
  return { kind: 'go', key, transport: deps.fetch };
}

function fail(reason: FailedReason, deps: JudgeDeps): JudgeOutcome {
  deps.breaker.recordFailure(deps.now());
  return { kind: 'failed', reason };
}

// The AbortController cancels a cooperative transport; the race guarantees the
// deadline even when a transport ignores the signal and never settles.
async function exchangeWithDeadline(
  transport: typeof globalThis.fetch,
  key: string,
  body: string,
  policy: JudgePolicy,
): Promise<Exchange> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Exchange>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: 'failed', reason: 'timeout' });
    }, policy.timeout_ms);
  });
  try {
    return await Promise.race([exchange({ transport, key, body, endpoint: policy.endpoint, signal: controller.signal }), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

interface ExchangeRequest {
  transport: typeof globalThis.fetch;
  key: string;
  body: string;
  endpoint: string;
  signal: AbortSignal;
}

async function exchange(request: ExchangeRequest): Promise<Exchange> {
  let response: Response;
  try {
    response = await request.transport(request.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${request.key}`, 'Content-Type': 'application/json' },
      body: request.body,
      signal: request.signal,
      // A redirect would carry the bearer token to wherever it points; the
      // endpoint is fixed policy data, so any redirect is a failure.
      redirect: 'error',
    });
  } catch {
    // The rejection value is discarded deliberately: transport errors can echo
    // request details, and only the closed reason vocabulary leaves this module.
    return { kind: 'failed', reason: request.signal.aborted ? 'timeout' : 'network' };
  }
  const statusFailure = classifyStatus(response.status);
  if (statusFailure !== null) return { kind: 'failed', reason: statusFailure };

  let text: string;
  try {
    text = await response.text();
  } catch {
    return { kind: 'failed', reason: request.signal.aborted ? 'timeout' : 'network' };
  }
  try {
    const raw: unknown = JSON.parse(text);
    return { kind: 'json', raw };
  } catch {
    return { kind: 'failed', reason: 'invalid-response' };
  }
}

// 429 -> http-429, other 4xx -> http-4xx, 5xx (including TypeSafe's 529
// Overloaded) -> http-5xx; any other non-2xx status is not a documented answer.
function classifyStatus(status: number): FailedReason | null {
  if (status >= 200 && status < 300) return null;
  if (status === 429) return 'http-429';
  if (status >= 400 && status < 500) return 'http-4xx';
  if (status >= 500 && status < 600) return 'http-5xx';
  return 'invalid-response';
}
