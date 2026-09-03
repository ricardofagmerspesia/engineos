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
- `status` is a FLOOR, not a count: the hooks derive it only from structure —
  the harness error flag, a top-level `.status` field, or the envelope word as
  the first token of a string response — and never by reading prose, which would
  hand a subagent a channel into telemetry. A structured response with none of
  those reads as `OK`, so real failures are undercounted; the breaker counter
  below needs a source that actually observes failure before it is built.
- `duration_ms` is real milliseconds wherever bash 5, GNU `date +%s%3N` or perl
  `Time::HiRes` is available, which covers macOS and Linux. The last-resort rung
  is whole seconds scaled by 1000, so a value ending in exactly `000` may be
  second-resolution rather than a coincidence.
- Bounded shape, not classified content: every field EXCEPT `note` is a slug
  (`^[A-Za-z0-9@_./:-]+$`) and the validator rejects a line where one of them is
  not. The two write boundaries differ on purpose, and the difference IS the
  claim — the CLI rejects a non-slug value outright, while the hooks sanitize
  first (`hook_slug` maps every other character to `-`) so a span is recorded
  rather than lost. A harness-supplied value's characters therefore still
  transit, dash-joined: `SECRET=hunter2 x` lands as `SECRET-hunter2-x`. What the
  guard buys is that no field but `note` can carry whitespace, a newline, a
  quote or a control character, so nothing written through one can break the
  line format, smuggle a second JSON object or span two lines — and that every
  value is length-bounded. It bounds the shape and the size of what reaches
  disk; it does not classify the content, and claiming otherwise is the same
  false-containment bug in a new coat.
- `note` is the single field that admits text: a consumer forwarding the journal
  treats `note` — and only `note` — as untrusted. Every value, `note` included,
  is capped at `telemetry.exec_journal.max_value_length` characters on append,
  and over-long is a reject rather than a truncation. Same words in
  `registries/policy.json` and `scripts/exec-journal.sh`'s header.
- Who writes what: the dispatch/return hooks write `agent` spans (duration and
  status only — `tokens_*` are 0 there because the hook cannot see the
  subagent's usage; do not read 0 as free); the prompt advisor writes `router`;
  the Stop gate writes `verification`. `tool` and `model` spans, and real token
  and cost figures, come from a headless runner that owns the model call.
- `capability_id` is always an id from `registries/capabilities.json`. Known
  imprecision: an agent span records `implement`, because dispatching is what
  the orchestrator does and no capability binds an agent to it — so a
  security-review dispatch also reads `implement`. Group by `agent` when the
  distinction matters.
- Consumers: today, none — spans are written and retained, and nothing reads
  them yet. Planned: the breaker's consecutive-failure count
  (`rules/parallelism.md`), blocked on the `status` floor above; then
  `scripts/usage-report.sh` and the retro, which read the kernel-decision
  events and do not sum span cost.
