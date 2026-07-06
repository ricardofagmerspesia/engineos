---
description: Invoke the mobile-coordinator agent (alias elias).
argument-hint: [task or question for the agent]
allowed-tools: Task
---

Dispatch the `mobile-coordinator` agent (alias `elias`) via the Task tool, passing
`$ARGUMENTS` as its prompt. If `$ARGUMENTS` is empty, ask the user what they
want the agent to do before dispatching.

The agent is scoped strictly to the React Native mobile app — it will not touch
API/backend, web frontend, or DevOps/infra, and will report a `### Blocked`
section if the task needs one of those. Relay its report back verbatim; do not
re-do its work yourself.
</content>
