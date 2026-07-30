---
name: 2026-07-16-store-builder-agents
status: done
owner: Ricardo Fagmer
spec: docs/specs/2026-07-16-store-builder-agents-design.md
domain: mobile
completed: 2026-07-16
---

## What
Add two store-release agents: `ios-builder` (build signed IPA, TestFlight,
App Store submission) and `android-builder` (build signed AAB, Google Play
tracks, staged production rollout), each owning its full pipeline end to end
with BUILD/BETA/RELEASE modes.

## Why
User wants fully automated build-and-publish for both stores. No existing agent
owned release: mobile-coordinator is fenced to app code, devops-coordinator to
generic infra. These agents encode every step — preflight, version bump, deps,
quality gates, signed build, upload, submission — so a single dispatch ships.

## Scope
`agents/ios-builder.md`, `agents/android-builder.md`,
`commands/agents/ios-builder.md`, `commands/agents/android-builder.md`,
`CLAUDE.md` (router "Mobile store release" row),
`docs/specs/2026-07-16-store-builder-agents-design.md`.

## Checklist
- [x] Write design spec
- [x] `ios-builder` agent def (8-step pipeline, BUILD/BETA/RELEASE, scope fence)
- [x] `android-builder` agent def (8-step pipeline, first-upload Blocked rule)
- [x] Dispatch commands for both (generator format, no alias)
- [x] Router row in CLAUDE.md
- [x] Record and archive the change

## What was made
Created `agents/ios-builder.md`: full iOS pipeline — preflight (Xcode/CLT,
CocoaPods, fastlane, App Store Connect API key env vars, match or keychain
signing, fail-fast listing all gaps at once), first-run fastlane scaffold,
build number from `latest_testflight_build_number + 1`, deps (`npm ci` +
`pod install`), typecheck/lint/tests gate, signed Release IPA via gym with raw
`xcodebuild archive`/`-exportArchive` fallback, `pilot` upload for BETA,
`deliver` with precheck + `submit_for_review` + phased release for RELEASE,
artifact + store-state verification. RELEASE mode gated on explicit user
instruction (store submission is public/outward-facing).

Created `agents/android-builder.md`: mirror pipeline for Play — preflight
(JDK-vs-AGP, SDK, upload keystore env vars, Play service-account JSON),
versionCode from `google_play_track_version_codes + 1`, `gradlew bundleRelease`
signed AAB, `fastlane supply` to internal/beta/production with changelogs +
`mapping.txt`, staged rollout (0.1 default) for RELEASE, and detection of
Google's first-upload-must-be-manual rule → `### Blocked`. Same explicit-
instruction gate for production.

Both defs carry hard scope fences (sibling store → sibling agent, feature code
→ mobile-coordinator, backend → backend-coordinator, infra →
devops-coordinator) and the security rule: credentials by env reference only,
never literals in repo or logs. Added both dispatch commands hand-written in
`gen-agent-commands.sh` output format (script not re-run — it wipes
`commands/agents/` and would destroy the customized elias command texts).
Added the "Mobile store release" intent row to the CLAUDE.md router table and
the design spec.

## Changes registered
```
 M CLAUDE.md
 M hooks/layout-manifest.sh
 M hooks/test-layout.sh
?? .engineos/changes/2026-07-16-store-builder-agents.md
?? agents/android-builder.md
?? agents/ios-builder.md
?? commands/agents/android-builder.md
?? commands/agents/ios-builder.md
?? docs/specs/2026-07-16-store-builder-agents-design.md

 CLAUDE.md                | 1 +
 hooks/layout-manifest.sh | 0
 hooks/test-layout.sh     | 0
 3 files changed, 1 insertion(+)
```
No renames, no deletions. `hooks/layout-manifest.sh` and `hooks/test-layout.sh`
are pre-existing unrelated mode-only modifications — not part of this change,
left untouched and excluded from the commit.

## Verification
Markdown/config repo — no typecheck/lint/build target. Consistency verified:
both agent defs carry `name:` frontmatter the command generator can parse (no
`Alias:` marker → alias degrades to the name, per generator logic); CLAUDE.md
new row is a well-formed 2-column table row; router row, agent defs, and
dispatch commands all state the same BUILD/BETA/RELEASE semantics and the
explicit-instruction gate for store submission.

## Notes
No human-name aliases assigned (user gave plain names ios-builder /
android-builder). `hooks/routing-map.sh` intentionally unchanged — release is a
request-driven intent, not a file-pattern domain.
