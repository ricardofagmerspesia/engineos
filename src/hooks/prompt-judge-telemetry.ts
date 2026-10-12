// What the judge event records for one consultation (contracts.md@rev3 §6.4).
// Shaping only: the advisor owns the sink and makes the telemetry call.
import type { Consultation } from './prompt-judge-consult';
import type { EventData } from './telemetry';

// contracts §6.4 `latency_bucket`, upper bounds exclusive; anything slower is `over`.
const LATENCY_BUCKETS: readonly [number, string][] = [[100, 'lt100'], [200, 'lt200'], [300, 'lt300'], [400, 'lt400']];

// One judge event per user prompt (contracts §6.4), ids and a latency bucket
// only. A key with no value is left out: the append boundary refuses empties.
// Null when the registry declares no judge block, which writes no event.
export function judgeEventData(consultation: Consultation): EventData | null {
  const { fact, policy, latencyMs } = consultation;
  if (policy === null) return null;
  const data: EventData = { source: fact === null ? 'fallback' : fact.source, mode: policy.mode };
  data.model = fact !== null && fact.source === 'jev' ? fact.model : policy.model;
  if (fact === null) data.skipped_reason = 'no-judge-fact';
  else if (fact.source === 'fallback') data.skipped_reason = fact.reason;
  if (latencyMs !== null) data.latency_bucket = latencyBucket(latencyMs);
  return data;
}

function latencyBucket(ms: number): string {
  return LATENCY_BUCKETS.find(([bound]) => ms < bound)?.[1] ?? 'over';
}
