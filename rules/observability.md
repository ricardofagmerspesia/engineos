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
- Secrets/tokens/PII never reach logs — `security.md` (always-on) owns that rule.
  No log-and-rethrow at every layer — `base.md` (always-on) owns that one.

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

## Agent traces

Structured logging above is for the systems we build. This section is for the
agents that build them. One session is one trace; every dispatched agent, the
router decision and the verification gate are spans in it.

- Home: `.git/engineos-telemetry/<session_id>.exec.jsonl`, schema
  `scripts/exec-journal.sh` (v2 fields optional, v1 lines stay valid).
- Correlation: `trace_id` = session id, `span_id` = the harness tool-use id,
  `parent_span_id` for nested spans. `span_kind` is one of
  `router | coordinator | agent | tool | model | verification`.
- Per span: `agent`, `model_tier`, `status` (the return-envelope vocabulary),
  `tokens_in`, `tokens_out`, `duration_ms`, `cost_micros` (integer micro-USD,
  absent when unknown), `retry_attempt`, `cache_hit`, `route`, `risk`,
  `tool`, `provider`, `model`.
- Never content: every string field is a slug (`^[A-Za-z0-9@_./:-]+$`). A
  prompt, a file body or a PII value cannot be written — the validator rejects
  it, the same invariant as the kernel-decision events.
- Who writes what: the dispatch/return hooks write `agent` spans (duration and
  status only — `tokens_*` are 0 there because the hook cannot see the
  subagent's usage; do not read 0 as free); the prompt advisor writes `router`;
  the Stop gate writes `verification`. `tool` and `model` spans, and real token
  and cost figures, come from a headless runner that owns the model call.
- Consumers: the breaker's consecutive-failure count (`rules/parallelism.md`),
  `scripts/usage-report.sh`, the retro.
