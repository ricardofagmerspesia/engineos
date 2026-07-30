# Store builder agents (ios-builder / android-builder) — design

## Problem

EngineOS had no agent that ships a mobile app to the stores. `mobile-coordinator`
writes app code but is fenced off from build/release; `devops-coordinator` owns
generic CI/infra but knows nothing of code signing, TestFlight, or Play tracks.
"Build and publish" requests had no owner and fell to ad-hoc manual steps.

## Decision

Add two sibling release agents, one per store, each owning its full pipeline
end to end:

- `ios-builder` — preflight (Xcode/CocoaPods/fastlane, App Store Connect API
  key, match/manual signing), build-number bump from TestFlight, deps, quality
  gates, signed Release IPA via gym (xcodebuild fallback), pilot upload,
  deliver + submit_for_review.
- `android-builder` — preflight (JDK vs AGP, SDK, upload keystore env vars,
  Play service-account JSON), versionCode bump from Play tracks, deps, quality
  gates, signed AAB via `gradlew bundleRelease`, `fastlane supply` to
  internal/beta/production with mapping.txt and staged rollout. Detects the
  first-upload-must-be-manual Play rule and reports Blocked.

Three modes instead of the usual two: `BUILD` (artifact only), `BETA` (default —
TestFlight / internal track), `RELEASE` (store review / production). RELEASE
runs only on an explicit, current user instruction — same idiom as
devops-coordinator's "never apply/deploy against real infra without confirmed
instruction", because a store submission is public and outward-facing.

Hard scope fences mirror the other coordinators: each writes only its native
tree + fastlane config; feature code → mobile-coordinator, backend →
backend-coordinator, generic CI → devops-coordinator, and the sibling store →
the sibling agent. Security: all credentials (certs, .p8 keys, keystore
passwords, service-account JSON) referenced by env var name only — never
literals in repo files or logs, per `rules/security.md`.

## Scope

- New: `agents/ios-builder.md`, `agents/android-builder.md`,
  `commands/agents/ios-builder.md`, `commands/agents/android-builder.md`.
- Changed: `CLAUDE.md` router table — new "Mobile store release" intent row.
- Not changed: `hooks/routing-map.sh` — release is a request-driven intent
  (like new-feature/release-notes rows), not a file-pattern domain; editing
  `build.gradle`/`Info.plist` alone shouldn't trigger a release agent.
- Command files hand-written in the generator's format rather than re-running
  `scripts/gen-agent-commands.sh`, which wipes `commands/agents/` and would
  destroy the hand-customized `elias.md`/`mobile-coordinator.md` texts.
- No human-name aliases (user specified plain names); generator convention
  degrades cleanly when no `Alias:` marker is present.

## Alternatives considered

- One combined `mobile-builder` agent — rejected: toolchains, credentials, and
  failure modes are disjoint; two focused defs stay under the file-size rule
  and can be dispatched in parallel for a dual-store release.
- Extend `devops-coordinator` — rejected: store signing/review flows are
  specialist knowledge and the coordinator's fence ("never deploy without
  instruction") would blur if it also owned routine TestFlight pushes.
