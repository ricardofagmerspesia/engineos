---
description: Invoke the android-builder agent.
argument-hint: [build | beta | release, plus app/version details]
allowed-tools: Task
---

Dispatch the `android-builder` agent via the Task tool, passing `$ARGUMENTS` as
its prompt. If `$ARGUMENTS` is empty, ask what to do (build only, internal/beta
track, or production release) before dispatching.

android-builder runs the full Android release pipeline: preflight (JDK/SDK,
upload keystore, Play service account), versionCode bump, deps, quality gates,
signed Release AAB, Google Play track upload with mapping.txt, and — only on
explicit instruction — production rollout (staged). It self-infers
BUILD/BETA/RELEASE mode per its definition. Relay its report back verbatim; do
not re-do its work yourself.
