---
description: Resolve a request into a dispatch plan — intents, rules, agents with disjoint file scopes, model per agent, risk, gates and waves. Runs the deterministic kernel first, then the router agent for the residue.
argument-hint: <the request, in plain words>
allowed-tools: Task, Bash, Read, Grep, Glob
---

You are the EngineOS route command. `$ARGUMENTS` is the raw request text,
verbatim, no preprocessing. If `$ARGUMENTS` is empty, ask the user what to
route and stop.

## Steps

1. Resolve the EngineOS install root — `${CLAUDE_PLUGIN_ROOT}` in plugin mode,
   the engineos repo otherwise, since this command runs with the target project
   as cwd and a bare relative `scripts/…` path there exits 127:

   ```bash
   ENGINEOS_ROOT=""
   for cand in "${CLAUDE_PLUGIN_ROOT:-}" $(readlink "$HOME"/.claude/commands/*.md 2>/dev/null); do
     d=$(cd "$(dirname "$cand")" 2>/dev/null && pwd) || continue
     while [ "$d" != "/" ]; do
       [ -x "$d/scripts/kernel.sh" ] && { ENGINEOS_ROOT="$d"; break 2; }
       d=$(dirname "$d")
     done
   done
   echo "$ENGINEOS_ROOT"
   ```

   Follow installed command symlinks upward to scripts/kernel.sh, skipping
   foreign commands. Read no personal config.

   Then ask the kernel for the route in one `resolve` call, substituting the
   printed root (shell state does not survive between Bash calls), and print
   its `.route` answer as one line:

   ```bash
   "$ENGINEOS_ROOT"/scripts/kernel.sh resolve --facts "$(node -e 'process.stdout.write(JSON.stringify({ prompt: process.argv[1], escalate: true }))' -- "$ARGUMENTS")"
   ```

   Node >=18 safely JSON-escapes request quotes/newlines; jq is unnecessary.
   escalate:true selects route-escalation fields (escalate/reasons/intents/agents/
   risk_floor/scale/ambiguous, then ranked/margin/judge). Empty root: report
   unreachable kernel and stop.

   The one-line summary carries the ranking as well as the decision, copied
   from `.route`, in this order:

   `[route] escalate=<bool> reasons=<ids|none> intents=<ids|none> ranked=<id:confidence,...|none> margin=<n|null> judge=<source>/<reason or model>`

   `ranked` lists `.route.ranked` in kernel order (`id:confidence` per
   candidate); `judge` reads `fallback/no-judge-fact` here because this call
   declares no judge fact. A trailing `low-confidence` in `reasons` means the
   top candidate or the margin was too weak to trust — the router agent settles
   it in step 2.
2. Dispatch the `router` agent via the Task tool with `model: opus`, passing
   `$ARGUMENTS` as the request. **Explicit invocation always dispatches**, even
   when `escalate` is `false` — the user asked for a plan, and the fast path in
   `hooks/prompt-advisor.sh` is an automation default, not a refusal. When
   `escalate` is `false`, say so in one line first, so the user can see the
   dispatch was optional.
3. Print, in this order:
   - the `[router]` line in CLAUDE.md's format
     (`[router] intent=<ids> risk=<tier> autonomy=<A?> loaded=<rules/skills>`),
     ending with ` corrected_from=<id>[,<id>...]` when the plan's
     `intent_overrides` dropped or displaced kernel-ranked intents (the ids the
     router names in `next_actions`); omit the token when the kernel's set was
     taken as-is. `engineos usage-report` mines it into its Misroutes section;
   - the plan's `Candidates` table, verbatim;
   - the plan's `fanout_line`;
   - the `dispatch_plan` JSON block, verbatim;
   - `unresolved` as a bulleted list, when non-empty.
4. Ask once whether to execute the plan. **Do not dispatch any unit yourself**
   — this command produces a plan; executing it is a separate, user-approved
   step.
5. No output-artifact offer: producing the plan IS the artifact, and
   CLAUDE.md's no-recursion rule applies — do not loop this plan back through
   the router table.

## Rules

- The router agent holds no `Edit`, `Write`, or `Task` tool. It cannot apply
  its own plan, and neither does this command on its behalf.
- Never fan out a wave before the user has confirmed step 4. A plan is a
  proposal, not authorization.
- If the router returns `BLOCKED`, surface `.error` (or the missing input) and
  stop — do not retry with a guessed request.
