---
description: Invoke the mobile-coordinator agent (alias elias) — web->mobile feature mirror.
argument-hint: [feature to mirror from web, or "audit parity"]
allowed-tools: Task
---

Dispatch the `mobile-coordinator` agent (alias `elias`) via the Task tool, passing
`$ARGUMENTS` as its prompt. If `$ARGUMENTS` is empty, ask which web feature to
mirror (or whether to run a parity audit) before dispatching.

elias mirrors features that already exist in the web frontend onto the React
Native mobile app: it reads the web app as its read-only source of truth and
writes only in the mobile tree — never API/backend, web frontend, or DevOps/infra.
If a mirror needs a missing API or a web change, it reports a `### Blocked`
section naming the owning coordinator. Relay its report back verbatim; do not
re-do its work yourself.
