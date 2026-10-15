import type { DecisionInput, EvaluationContext, Evaluator, ProviderFailure, ProviderId, ProviderMetadata, ProviderResult } from '../contracts';
import { SCHEMA_VERSION } from '../contracts';
import { parseDecisionInput, parseEvaluation } from '../core';
import type { DecisionConfig, Tariff } from './config';
import { CHALLENGE_PROMPT_VERSION, PROMPT_VERSION, instructions, providerSchema, redact } from './schema';
export { getDecisionConfig } from './config';
export type { DecisionConfig, Tariff } from './config';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
function tokens(value: unknown): number | null { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null; }
function retryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, Math.min(delay, 600000)) : null;
}
async function readBody(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_RESPONSE_BYTES) throw new Error('Provider response exceeds size limit');
  if (!response.body) throw new Error('Provider returned no response body');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('Provider response exceeds size limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function calculateCost(provider: ProviderId, payload: Record<string, unknown>, metadata: ProviderMetadata, tariff: Tariff | undefined): number | null {
  if (!tariff || metadata.inputTokens === null || metadata.outputTokens === null) return null;
  const usage = object(payload.usage), details = object(usage.input_tokens_details);
  const read = metadata.cachedReadTokens ?? 0, write = metadata.cacheWriteTokens ?? 0;
  let regular = metadata.inputTokens, writeCost = write * tariff.cacheWriteMicrosPerMillion;
  if (provider === 'openai') {
    regular -= read + write;
    // If input details contain additional categories, preserve usage but refuse guessed billing.
    if (Object.keys(details).some(key => key !== 'cached_tokens' && key !== 'cache_write_tokens')) return null;
  } else {
    const creation = object(usage.cache_creation);
    const hour = tokens(creation.ephemeral_1h_input_tokens) ?? 0;
    if (hour > write || (hour > 0 && tariff.cacheWriteHourMicrosPerMillion === undefined)) return null;
    writeCost = (write - hour) * tariff.cacheWriteMicrosPerMillion + hour * (tariff.cacheWriteHourMicrosPerMillion ?? 0);
  }
  if (regular < 0) return null;
  const micros = (regular * tariff.inputMicrosPerMillion + metadata.outputTokens * tariff.outputMicrosPerMillion + read * tariff.cachedReadMicrosPerMillion + writeCost) / 1000000;
  return Number.isFinite(micros) && micros >= 0 && micros <= Number.MAX_SAFE_INTEGER ? Math.ceil(micros) : null;
}
function metadataFor(provider: ProviderId, payload: Record<string, unknown>, response: Response, startedAt: string, config: DecisionConfig, challenge: boolean): ProviderMetadata {
  const usage = object(payload.usage), details = object(usage.input_tokens_details);
  const model = typeof payload.model === 'string' ? payload.model : '';
  const metadata: ProviderMetadata = { provider, model, requestId: response.headers.get(provider === 'openai' ? 'x-request-id' : 'request-id'), responseId: typeof payload.id === 'string' ? payload.id : null,
    startedAt, completedAt: new Date().toISOString(), inputTokens: tokens(usage.input_tokens), outputTokens: tokens(usage.output_tokens),
    cachedReadTokens: tokens(provider === 'openai' ? details.cached_tokens : usage.cache_read_input_tokens), cacheWriteTokens: tokens(provider === 'openai' ? details.cache_write_tokens : usage.cache_creation_input_tokens), costMicros: null,
    tariffVersion: config.tariffVersion, promptVersion: challenge ? CHALLENGE_PROMPT_VERSION : PROMPT_VERSION, schemaVersion: SCHEMA_VERSION };
  metadata.costMicros = calculateCost(provider, payload, metadata, config.tariffVersion ? config.tariffs[model] : undefined);
  return metadata;
}
function failure(provider: ProviderId, kind: ProviderFailure['kind'], message: string, retryable = false, retryAfterMs: number | null = null, metadata?: ProviderMetadata): ProviderFailure {
  return { ok: false, provider, kind, message, retryable, retryAfterMs, ...(metadata ? { metadata } : {}) };
}
function contentText(provider: ProviderId, payload: Record<string, unknown>): string | null {
  const messages = provider === 'openai' ? (Array.isArray(payload.output) ? payload.output.filter(item => object(item).type === 'message').flatMap(item => Array.isArray(object(item).content) ? object(item).content as unknown[] : []) : []) : (Array.isArray(payload.content) ? payload.content : []);
  const texts = messages.filter(item => object(item).type === (provider === 'openai' ? 'output_text' : 'text'));
  // Exactly one structured payload avoids merging ambiguous independent messages.
  return texts.length === 1 && typeof object(texts[0]).text === 'string' ? object(texts[0]).text as string : null;
}
function refused(provider: ProviderId, payload: Record<string, unknown>): boolean {
  if (provider === 'anthropic') return payload.stop_reason === 'refusal' || object(payload.stop_details).type === 'refusal';
  return Array.isArray(payload.output) && payload.output.some(item => object(item).type === 'message' && Array.isArray(object(item).content) && (object(item).content as unknown[]).some(part => object(part).type === 'refusal'));
}
export function createEvaluator(config: DecisionConfig): Evaluator {
  return { evaluate: (provider, input, context) => evaluate(provider, input, context, config) };
}
async function evaluate(provider: ProviderId, input: DecisionInput, context: EvaluationContext, config: DecisionConfig): Promise<ProviderResult> {
  if (!config.enabled) return failure(provider, 'provider_error', 'Decisions feature is disabled');
  const model = provider === 'openai' ? config.openaiModel : config.anthropicModel;
  const key = provider === 'openai' ? config.openaiApiKey : config.anthropicApiKey;
  if (!model || !key) return failure(provider, 'provider_error', 'Provider model and server credentials must be configured');
  if (context.signal.aborted) return failure(provider, 'cancelled', 'Evaluation cancelled');
  const remaining = context.deadlineAt - Date.now();
  if (remaining <= 0) return failure(provider, 'timeout', 'Evaluation deadline exhausted');
  if (!Number.isSafeInteger(context.outputTokenLimit) || context.outputTokenLimit < 1 || context.outputTokenLimit > config.policy.outputTokenLimit) return failure(provider, 'provider_error', 'Invalid output token limit');
  try { parseDecisionInput(input); } catch { return failure(provider, 'invalid_output', 'Invalid frozen decision input'); }
  const snapshot = redact(JSON.stringify({ frozenDecision: input, ...(context.counterAssessment ? { anonymizedCounterAssessment: context.counterAssessment } : {}) }));
  if (Buffer.byteLength(snapshot) > 512 * 1024) return failure(provider, 'provider_error', 'Provider input exceeds size limit');
  const body = provider === 'openai' ? { model, instructions, input: snapshot, max_output_tokens: context.outputTokenLimit, store: false, text: { format: { type: 'json_schema', name: 'decision_evaluation', schema: providerSchema, strict: true } } } : { model, system: instructions, messages: [{ role: 'user', content: snapshot }], max_tokens: context.outputTokenLimit, output_config: { format: { type: 'json_schema', schema: providerSchema } } };
  const controller = new AbortController();
  let deadlineExpired = false;
  const cancel = () => controller.abort();
  context.signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => { deadlineExpired = true; controller.abort(); }, remaining);
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(provider === 'openai' ? 'https://api.openai.com/v1/responses' : 'https://api.anthropic.com/v1/messages', {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(provider === 'openai' ? { authorization: `Bearer ${key}` } : { 'x-api-key': key, 'anthropic-version': '2023-06-01' }) }, body: JSON.stringify(body),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) return failure(provider, 'rate_limit', 'Provider rate limit', true, retryAfter(response.headers.get('retry-after')));
      if (response.status === 408) return failure(provider, 'timeout', 'Provider request timed out', true);
      return failure(provider, 'provider_error', `Provider HTTP ${response.status}`, response.status === 409 || response.status >= 500);
    }
    let payload: Record<string, unknown>;
    try { payload = object(await readBody(response)); } catch {
      if (controller.signal.aborted) throw new Error('Aborted');
      return failure(provider, 'invalid_output', 'Provider response is invalid or exceeds size limit');
    }
    const metadata = metadataFor(provider, payload, response, startedAt, config, Boolean(context.counterAssessment));
    if (refused(provider, payload)) return failure(provider, 'refusal', 'Provider refused assessment', false, null, metadata);
    if ((provider === 'openai' && payload.status === 'incomplete') || (provider === 'anthropic' && payload.stop_reason === 'max_tokens')) return failure(provider, 'incomplete', 'Provider output incomplete', false, null, metadata);
    if ((provider === 'openai' && payload.status !== 'completed') || (provider === 'anthropic' && payload.stop_reason !== 'end_turn')) return failure(provider, 'provider_error', 'Provider response did not complete normally', false, null, metadata);
    if (!metadata.model || !metadata.responseId || metadata.inputTokens === null || metadata.outputTokens === null) return failure(provider, 'invalid_output', 'Provider response is missing trusted metadata', false, null, metadata);
    const text = contentText(provider, payload);
    if (text === null) return failure(provider, 'invalid_output', 'Expected a single structured text output', false, null, metadata);
    try { return { ok: true, evaluation: parseEvaluation(input, JSON.parse(text)), metadata }; }
    catch { return failure(provider, 'invalid_output', 'Assessment failed structural or semantic validation', false, null, metadata); }
  } catch {
    if (context.signal.aborted) return failure(provider, 'cancelled', 'Evaluation cancelled');
    if (deadlineExpired) return failure(provider, 'timeout', 'Evaluation deadline exhausted');
    return failure(provider, 'transport_error', 'Provider transport failed', true);
  } finally { clearTimeout(timeout); context.signal.removeEventListener('abort', cancel); }
}
