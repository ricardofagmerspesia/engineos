---
description: Resolve a request into a dispatch plan — intents, rules, agents with disjoint file scopes, model per agent, risk, gates and waves. Runs the deterministic kernel first, then the router agent for the residue.
argument-hint: <the request, in plain words>
allowed-tools: Task, Bash, Read, Grep, Glob
---

You are the EngineOS route command. `$ARGUMENTS` is the raw request text,
verbatim, no preprocessing. If `$ARGUMENTS` is empty, ask the user what to
route and stop.

## Steps

1. Run `scripts/kernel.sh route-escalate --prompt "$ARGUMENTS"` and print the
   kernel's answer as one line.
2. Dispatch the `router` agent via the Task tool with `model: opus`, passing
   `$ARGUMENTS` as the request. **Explicit invocation always dispatches**, even
   when `escalate` is `false` — the user asked for a plan, and the fast path in
   `hooks/route-advisor.sh` is an automation default, not a refusal. When
   `escalate` is `false`, say so in one line first, so the user can see the
   dispatch was optional.
3. Print, in this order:
   - the `[router]` line in CLAUDE.md's format
     (`[router] intent=<ids> risk=<tier> autonomy=<A?> loaded=<rules/skills>`);
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
