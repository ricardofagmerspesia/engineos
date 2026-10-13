# JavaScript ecosystem and parallel development policy

## User requirements
- Active development stack: JavaScript/TypeScript, Node.js, NestJS, Next.js, React, React Native and JavaScript LLM tooling.
- Independent implementation work runs concurrently with exclusive file ownership, frozen shared contracts and dependency-aware scheduling; respect actual host capacity.
- Test authoring and execution happen only after implementation/integration is complete and only with explicit user approval for the current task. No implicit approval from agents, project configuration, feature workflows or environment flags.
- Preserve existing tests. Lint/typecheck/build are non-test final validation.

## Design and compatibility
Active defaults and routing become JavaScript-only. Keep legacy public paths and parsing compatibility during the deprecation window, but do not automatically recommend or execute Python work. Do not silently delete legacy interfaces. Explicit unsupported requests explain scope rather than generating a different stack. This policy replaces automatic feature proofs/TDD during implementation with acceptance criteria and an approved final test phase.
Alternative rejected: deleting every Python path immediately breaks published consumers and historical records.
Rollback: revert this working-tree change set; no git/forge writes, deployment or data migration is included.

## Tasks and ownership
1. stack-migration: stack detection/init/config and verification runner selection; exclude stop-verify.ts and all test files.
2. workflow-policy: rule prose, skills/agents/commands/templates; exclude router mirrors CLAUDE.md/AGENTS.md/README.md and TypeScript.
3. routing-policy: registries, router mirrors, validator and active ecosystem patterns; exclude above owners and test files.
4. orchestrator: approval enforcement in stop-verify.ts, integration, bundled runtime, final lint/typecheck/build and integrity validation; tests pending approval.

## Acceptance checks
- Auto stack resolution and new declarations use Node ecosystem frameworks only.
- No active route recommends Python/FastAPI or Python LLM patterns.
- Final test execution requires task-specific explicit approval; legacy VERIFY_TESTS alone cannot authorize tests.
- Independent work is scheduled without needless whole-wave waiting, bounded by host capacity and exclusive ownership.
- Relevant rule/registry mirrors agree; shipped bundle reflects sources.
- Report non-test validation results and honestly report tests not run.
