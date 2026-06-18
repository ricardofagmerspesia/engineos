# Observability Rules

Cross-cutting standard for logs, metrics, traces, and errors. Other rule files
reference this instead of restating logging guidance.

## Structured logging
- DO log as structured JSON with a stable minimum field set:
  `timestamp, level, event, correlationId, service, durationMs` (+ domain fields).
- DO propagate a `correlationId` (a.k.a. trace/request id) end-to-end: inbound
  request → services → queue jobs → outbound calls. Generate at the edge if absent.
- DO log at boundaries (request in/out, job start/end, external call) — not at
  every line. Log once, at the layer that can act.
- DON'T log secrets, tokens, or PII. DON'T log-and-rethrow at every layer.

## Metrics & tracing
- DO emit the four golden signals per service: latency, traffic, errors,
  saturation. Alert on symptoms (error rate, p99 latency), not just causes.
- DO trace cross-service requests with propagated context so a single request is
  reconstructable across hops.
- DO set SLOs for user-facing paths and alert on burn rate, not raw thresholds.

## Error taxonomy
- DO classify errors into stable categories: `validation`, `auth`, `not_found`,
  `conflict`, `rate_limited`, `dependency`, `internal`. Map each to the right
  HTTP status (and process exit code for CLIs).
- DO attach `correlationId` to every error surfaced to a client; return a stable
  error `code`, never internal stack traces, queries, or paths (see `security.md`).
- DO distinguish expected/domain errors (handled, typed) from unexpected
  (reported to the error tracker with full context server-side).

## Health & readiness
- DO expose liveness and readiness checks; readiness must reflect real
  dependencies (DB, queue) so orchestrators route traffic correctly.
