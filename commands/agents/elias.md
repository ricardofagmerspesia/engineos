---
description: Invoke the mobile-coordinator agent (alias elias) — mobile domain specialist (greenfield + web->mobile mirror).
argument-hint: [mobile feature to build, feature to mirror from web, or "audit parity"]
allowed-tools: Task
---

Dispatch the `mobile-coordinator` agent (alias `elias`) via the Task tool, passing
`$ARGUMENTS` as its prompt. If `$ARGUMENTS` is empty, ask what mobile work to do
(build a mobile feature, mirror a web feature, or run a parity audit) before
dispatching.

elias is the mobile domain specialist (React Native): it builds greenfield mobile
features and mirrors features that already exist in the web frontend, reading the
web app as a read-only reference when mirroring. It writes only in the mobile
tree — never API/backend, web frontend, or DevOps/infra. If the work needs a
missing API or a web change, it reports a `### Blocked` section naming the owning
coordinator. Relay its report back verbatim; do not
re-do its work yourself.
