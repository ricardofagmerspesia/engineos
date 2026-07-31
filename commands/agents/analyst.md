---
description: Invoke the architecture-analyst agent (alias analyst).
argument-hint: [task or question for the agent]
allowed-tools: Task
---

If `$ARGUMENTS` is interview-shaped ("interview", "ask me", "talk about", or
similar) — do NOT dispatch a subagent. INTERVIEW mode needs live, interactive
answers from the user, which a dispatched Task cannot provide. Instead, tell the
user to run `/talk-about-the-system` in the main session, and stop.

Otherwise, dispatch the `architecture-analyst` agent (alias `analyst`) via the
Task tool, passing `$ARGUMENTS` as its prompt. If `$ARGUMENTS` is empty, ask the
user what they want the agent to do before dispatching.

The agent follows its own mode and output rules (it self-infers ANALYZE vs
INTERVIEW where applicable). Relay its report back verbatim; do not re-do its
work yourself.
