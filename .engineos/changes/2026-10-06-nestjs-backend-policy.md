# NestJS required for application backends

Spec: docs/specs/2026-10-06-nestjs-backend-policy.md
Risk: medium. Autonomy: A2. Gate: final non-test validation passed; testing pending approval.

## Human decisions
2026-10-06: User explicitly requires NestJS rather than plain Node.js/Express application backends. Node remains runtime/tooling. Test authorization remains pending. No git/forge writes authorized or performed.

## Checklist
- [x] Scope, policy contract and rollback written before implementation
- [x] Backend rules, skill, coordinator, templates, prompts and routing aligned
- [x] NestJS mandatory for APIs, workers, webhooks and hosted LLM services
- [x] Standalone Node/Express backend declarations refused with NestJS guidance
- [x] Nest Express adapter allowed; tooling/shared libraries and truthful legacy detection preserved
- [x] Final non-test validation: npm run typecheck (also repository lint implementation), npm run build, registry JSON syntax, git diff --check — all exit 0
- [x] Shipped runtime rebuilt; agent registry/commands regenerated
- [ ] Final tests and behavioral integrity validation — pending explicit user approval

## What was made
rules/base.md owns the mandatory NestJS application-backend policy. Backend mechanics and coordinator enforce it, including when the repo is greenfield, without asking the user to reselect NestJS. Stack prompts ask only unresolved scope/deployment and other tiers. Express may be Nest's HTTP adapter; standalone Express/plain Node servers are excluded. Next.js handlers serve frontend integration/proxy/BFF; independent domain backends use Nest modules/providers. Explicit --stack node/express requests receive NestJS guidance; auto detection and existing config parsing remain unchanged and truthful. Existing non-Nest services require an explicit migration scope before extension, not an implicit conversion. Active routing sends Express/Node backend requests to the backend coordinator. README, canonical router, project template and LLM host guidance agree.

## Limits / rollback
Policy guidance and explicit declaration checks enforce the new choice; no existing consumer application was migrated. Protected AGENTS.md and .agents copies were not modified. Prior working-tree changes and pre-existing untracked pnpm files were preserved. This is uncommitted working-tree work. Rollback: revert this focused change set.
