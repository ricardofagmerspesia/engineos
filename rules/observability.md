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

One session = one trace; router, agents and final verification are spans.

- Home: `.git/engineos-telemetry/<session_id>.exec.jsonl`, schema
  `scripts/exec-journal.sh` (optional v2 fields preserve v1 validity).
- Correlation: `trace_id` session id, `span_id` harness tool-use id,
  `parent_span_id` for nesting. `span_kind` is one of
  `router | coordinator | agent | tool | model | verification`.
- Fields: `agent`, `model_tier`, envelope `status`, `tokens_in`, `tokens_out`,
  `duration_ms`, integer micro-USD `cost_micros` (absent when unknown),
  `retry_attempt`, `cache_hit`, `route`, `risk`, `tool`, `provider`, `model`.
- `status` is a FLOOR: derived from harness error flag, top-level `.status` or
  first-token envelope status, never prose (which would admit telemetry injection).
  Missing structural failure signals read OK and undercount failures; breaker
  consumers require a genuinely observing failure source.
- `duration_ms` uses bash 5/GNU date/perl Time::HiRes on macOS/Linux; fallback
  is whole seconds × 1000, so trailing 000 may indicate coarse resolution.
- Bounded shape: every field EXCEPT `note` is a slug
  (`^[A-Za-z0-9@_./:-]+$`). CLI rejects invalid slugs; hooks sanitize via
  `hook_slug`, replacing other characters with `-` rather than losing spans.
  Characters still transit dash-joined (`SECRET=hunter2 x` → `SECRET-hunter2-x`).
  This prevents whitespace/newlines/quotes/control-character line injection;
  it does not classify the content or remove secrets/attacker influence.
- `note` alone admits free text; other fields remain untrusted too. Slugs permit
  `.`/`/` and traversal such as `../../etc/cron.d/x`; never use journal values
  as filesystem path components without narrowing. `src/lib/slug.ts`
  `hookPathSlug` excludes those characters. Every value, including note, has
  `telemetry.exec_journal.max_value_length` (256) on append: reject, never truncate.
  Registry and journal header mirror the bound.
- Dispatch/return hooks write agent duration/status with `tokens_in`/`tokens_out`
  null because usage is unobservable: a null is an unknown rather than a zero
  a consumer could sum. Prompt advisor writes router; Stop writes verification.
  Headless model-owning runners supply tool/model spans and actual tokens/cost.
- `capability_id` comes from `registries/capabilities.json`. Agent dispatches
  record implement even for security review; group by agent to distinguish them.
- No current consumers: spans are retained. Planned breaker failure counts
  (`rules/parallelism.md`) depend on fixing the status floor. Usage-report/retro
  currently read kernel-decision events and do not sum span cost.
