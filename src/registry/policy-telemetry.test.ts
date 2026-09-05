import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTelemetryPolicy, TELEMETRY_EVENT_IDS } from './policy-telemetry';
import { resolveRoot } from './paths';

const root = resolveRoot(process.env, __dirname);

// The pin. TelemetryEventId is derived from this array, so an event added to or
// renamed in registries/policy.json fails here rather than at a hook's append,
// where the refusal is swallowed and the line simply never appears.
test('the TelemetryEventId literals are exactly the registry event ids, in registry order', () => {
  assert.deepEqual([...TELEMETRY_EVENT_IDS], loadTelemetryPolicy(root).events.map((e) => e.id));
});

test('every shipped event declares at least one key', () => {
  for (const event of loadTelemetryPolicy(root).events) {
    assert.ok(event.keys.length > 0, event.id);
  }
});
