---
description: Invoke the ios-builder agent.
argument-hint: [build | beta | release, plus app/version details]
allowed-tools: Task
---

Dispatch the `ios-builder` agent via the Task tool, passing `$ARGUMENTS` as its
prompt. If `$ARGUMENTS` is empty, ask what to do (build only, TestFlight beta,
or App Store release) before dispatching.

ios-builder runs the full iOS release pipeline: preflight (Xcode, signing,
App Store Connect API key), version bump, deps, quality gates, signed Release
IPA, TestFlight upload, and — only on explicit instruction — App Store review
submission. It self-infers BUILD/BETA/RELEASE mode per its definition. Relay
its report back verbatim; do not re-do its work yourself.
