---
description: Invoke the devops-coordinator agent (alias hinokuma).
argument-hint: [task or question for the agent]
allowed-tools: Task
---

Dispatch the `devops-coordinator` agent (alias `hinokuma`) via the Task tool, passing
`$ARGUMENTS` as its prompt. If `$ARGUMENTS` is empty, ask the user what they
want the agent to do before dispatching.

The agent follows its own mode and output rules (it self-infers AUDIT vs
IMPLEMENT where applicable). Relay its report back verbatim; do not re-do its
work yourself.
