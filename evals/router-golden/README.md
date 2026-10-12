# Router golden set

The end-to-end set that decides which routing mode (`keyword`, `llm`, `jev`) runs
when neither `ENGINEOS_ROUTER` nor a repo's `.engineos/config.json` picks one. Its
run writes `registries/policy.json` `router_decision.default`; nothing else does.
Design: `docs/specs/2026-10-06-routing-decision-layer-design.md` §6; shapes:
`docs/specs/2026-10-06-routing-decision-layer-contracts.md` §5.

It is separate from `evals/intent-routing-cases.jsonl`, which keeps guarding the
keyword floor and the stack rebind in `scripts/run-evals.sh`.

## Files

| File | Committed | What it holds |
|---|---|---|
| `candidates.local.jsonl` | no (gitignored) | real prompts `collect` pulled from your session transcripts, unlabelled. May contain client data |
| `cases.jsonl` | yes, once curated | the labelled set `run` grades. Absent until you curate the first cases |
| `RESULTS.md` | yes | the last run's table per mode, date, case count and EngineOS HEAD. Rewritten by every run |

## 1. Collect

While `router_decision.default` is `null` the prompt hook runs in shadow: every
substantive prompt gets a `router` span with the mode that decided, the keyword
answer and whether the two disagreed. The span holds registry ids only, never the
prompt.

```bash
./scripts/router-golden.sh collect ~/Documents/labv-assist ~/Documents/gest-leite   # default: the cwd repo
```

For each repo it reads `.git/engineos-telemetry/*.exec.jsonl`, keeps the router
spans, and joins each to the prompt that fired it: the span's `trace_id` is the
Claude Code session id, so the prompt is the user turn in
`~/.claude/projects/*/<trace_id>.jsonl` closest before the span (the latest one
when several qualify, within 60 s). A span that lands on a subagent hand-back or a
task notification is counted as `non-human` and skipped. The repo's stack is
resolved from its manifests (`<language>` or `<language>:<framework>` per
package). It prints counts only — never prompt text.

## 2. Curate

For each candidate you keep, copy the line into `cases.jsonl` and:

- set `expect_intents` to the intent ids the prompt should load (`registries/intents.json`), and `expect_escalate` to `true` or `false`;
- **redact client data** in `prompt` (names, hosts, ids) — the file is committed, and a `jev` run sends it to TypeSafe;
- keep `source: "real"`; cases you write yourself are `source: "synthetic"` and should never outnumber the real ones (the results flag it when they do);
- give it a stable `id` (`rg-001`, ...) and check `stack` and `repo`. `stack: []` means a repo with no manifest;
- delete the `shadow` block or leave it — `run` ignores it.

A line with `expect_intents: null`, a bad `stack` or a duplicate `id` makes `run`
exit 1 without scoring anything.

## 3. Run

```bash
./scripts/router-golden.sh run                       # every mode, report only
./scripts/router-golden.sh run --mode keyword        # one mode
./scripts/router-golden.sh run --write-default       # apply the acceptance rule
```

Each case runs through the same path a real prompt takes — resolve-task, then the
prompt advisor's decision layer with the mode forced — inside a throwaway project
holding the case's stack. Per mode it reports `intent_accuracy` (every expected
intent was decided), `stack_correctness` (no decided intent the case's stack rules
out), `p95_ms` and `fallback_rate`, plus `escalate_rate` in `RESULTS.md`.

`llm` decides the same intents as the floor — what it adds is escalation to the
in-session router agent, which the run reports but does not grade.

**`jev` needs `TYPESAFE_API_KEY` in your environment and sends every case's prompt,
languages, frameworks and named files to TypeSafe.** Curate and redact before you
run it. Without the key every `jev` case falls back to keyword and shows up as a
fallback rate of 1.0.

## Acceptance rule and the default

Only `run --write-default` writes `router_decision.default` and
`default_written_by` (date, this set's path and hash, the scores of every mode).
It writes a mode only when all of these hold:

- every mode the policy lists was scored in this run;
- that mode's `intent_accuracy` is strictly the highest (a tie decides nothing);
- its `stack_correctness` is 1.0.

Otherwise it writes `null` for both — shadow continues — and says why. The rest
of `policy.json` stays byte-identical, and a rewrite the strict loader refuses is
put back. The hook obeys the new default from the next prompt.
