import { z } from 'zod';
import { createDecisionRequestSchema, revisionRequestSchema, reviewRequestSchema, evidenceVerificationRequestSchema, startRunRequestSchema, type DecisionInput, type ReviewRequest } from '../../lib/decisions/contracts';
import { detailSchema, listSchema, summarySchema, revisionSchema, runSchema, reviewSchema, evidenceCheckSchema } from './response-schemas';
export class DecisionApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly fields: string[] = []) { super(message); this.name = 'DecisionApiError'; }
}
const errorSchema = z.object({ error: z.object({ message: z.string(), fields: z.array(z.string()).optional() }) });
async function request<T>(url: string, schema: z.ZodType<T>, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal });
  const data: unknown = await response.json();
  if (!response.ok) { const parsed = errorSchema.safeParse(data); throw new DecisionApiError(parsed.success ? parsed.data.error.message : `Request failed (${response.status})`, response.status, parsed.success ? parsed.data.error.fields ?? [] : []); }
  return schema.parse(data);
}
const base = '/api/decisions';
export function listDecisions(offset: number, signal?: AbortSignal) { return request(`${base}?limit=20&offset=${offset}`, listSchema, undefined, signal); }
export function readDecision(id: string, signal?: AbortSignal) { return request(`${base}/${encodeURIComponent(id)}`, detailSchema, undefined, signal); }
export function createDecision(input: DecisionInput, idempotencyKey: string) { return request(base, summarySchema, createDecisionRequestSchema.parse({ input, idempotencyKey })); }
export function reviseDecision(id: string, input: DecisionInput, expectedRevision: number) { return request(`${base}/${encodeURIComponent(id)}/revisions`, revisionSchema, revisionRequestSchema.parse({ input, expectedRevision })); }
export function startRun(id: string, revision: number, idempotencyKey: string) { return request(`${base}/${encodeURIComponent(id)}/runs`, runSchema, startRunRequestSchema.parse({ revision, idempotencyKey })); }
export function cancelRun(id: string, runId: string) { return request(`${base}/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/cancel`, runSchema, {}); }
export function submitReview(id: string, body: ReviewRequest) { return request(`${base}/${encodeURIComponent(id)}/reviews`, reviewSchema, reviewRequestSchema.parse(body)); }
export function verifyEvidence(id: string, body: z.infer<typeof evidenceVerificationRequestSchema>) { return request(`${base}/${encodeURIComponent(id)}/evidence-checks`, evidenceCheckSchema, evidenceVerificationRequestSchema.parse(body)); }
