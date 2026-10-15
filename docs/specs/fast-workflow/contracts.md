# Frozen contract — fast-workflow-v1

Owner: supervisor. Preserve all unrelated dirty changes and the previous decision-framework feature. Branch/PR recorded in change record. The approved PRD and ADR own semantics.

## Ticket 2: execution/kernel planning

Add optional ExecutionFacts fields scopeRevision:string, specChoice:'pending'|'direct'|'spec', specChoiceScopeRevision:string. Export isSimpleTaskEligible(facts:ExecutionFacts,maxFiles:number):boolean. Eligible means every existing eligibility fact is known, complexity small, risk low, reversible, <=2 files, one domain, one implementation unit, no securitySensitive, requiredAgents empty and designRequired false. Small newFeature=true alone does not preclude eligibility; independent design/public/security gates still do.

Add optional ExecutionSection.planning {simple:boolean,decision:'pending'|'direct'|'spec',scopeRevision:string|null,choices:string[],rulesMode:'stack'|'full',previewRequired:boolean}. With workflow.simple_spec_choice=true, eligible tasks without current matching scope-bound choice remain unresolved with an actionable spec choice; direct grants direct execution; spec chooses full spec lane. Unknown fields malformed, missing facts no direct. Exported parseExecutionFacts handles these fields. Resolver applies classification floors before eligibility and may suppress ONLY generic spec-threshold design obligations for a proven eligible simple task; never suppress other gates. Eligible direct task_contract loads stack rules and minimal security/Git safeguards, not the full workflow bundle. Non-simple work retains full routing.

Ticket 2 owns src/workflow/contracts.ts, src/kernel/execution.ts, src/kernel/resolve.ts, src/registry/policy.ts only. WorkflowPolicy adds optional simple_spec_choice and final_validation_prompt booleans. Policy reader treats absent flags as false for compatibility; malformed explicit flags fail closed. Supervisor sets the registry flags.

## Ticket 3: final gate

WorkflowGateFacts add execution?:ExecutionFacts and completion?:{scopeRevision:string,sourceRevision:string,requiredTicketIds:string[],tickets:{id:string,state:UnitState}[],unfinishedCorrections:boolean}. completion tickets enumerate IMPLEMENTATION units only, never the pending final-validation ticket. Require nonempty unique requiredTicketIds from the approved implementation graph, the exact same ticket-id set in tickets, all integrated, no unfinishedCorrections and exact current scope/source. Validation adds requestedAtPhase?:'final'. validationAllowed requires these completion facts, current final phase, current approved nonempty checks and actual final prompt marker; no earlier blanket approval. Preserve legacy preview production admission for specs. For eligible simple direct production, isSimpleTaskEligible(execution,2) and exact scope-bound direct choice replace mandatory preview. Direct execution facts scopeRevision must match outer scopeRevision. Requested spec is not direct admission.

Ticket 3 owns src/workflow/gates.ts only; no intermediate executable checks. Required code exports remain named and preserve existing error handling. Host adapters do not fabricate approval facts.

## Ticket 4: native skill integration

Use installed Matt Pocock to-tickets via bounded upstream-to-tickets skill reference. Do not edit vendored upstream skills. Accepted specs produce multiple complete dependency-aware tickets and a consolidated graph. Keep local tickets by default for this approved graph; external trackers need explicit authorization. Frozen contract/path/owner/scope are EngineOS brief metadata alongside upstream ticket semantics. No test ticket/check is launched or used as an implementation-integration prerequisite before full implementation and final consent. Document final-proof tickets separately from runtime implementation graphs where necessary. Native implement skill consumes frontier immediately, skips duplicate interviews, retains current branch/PR and host capacity, prevents colliding writers/nested supervisors.

Ticket 4 owns skills/engineos-spec/SKILL.md, skills/engineos-implement-spec/SKILL.md, commands/new-feature.md, commands/implement.md, commands/implement-spec.md, registries/skill-references.json and src/kernel/skill-reference.ts only.

## Supervisor integration / Ticket 5

Supervisor owns registries/policy.json, registries/decision-rules.json, registries/intents.json, AGENTS.md, CLAUDE.md, rules/{parallelism,verification,gates,subagents}.md, hook guidance, host adapters, compatibility docs and generated bundle. Update validation mirror checks only at final proof if required. Strong always-on safety/Git policy retained; simple-path guidance loads only applicable stack references beyond them. Always present actual permitted clickable input; text fallback honest where host has no controls.

## Final proof / Ticket 6

Author/run meaningful regression checks only after Tickets 1–5 are integrated and user approves exact final commands/revision. Cover absent/stale scope choices, eligible tiny feature, unsafe/unknown facts, relevant rule loading, no early final approval, missing/incomplete ticket lists, unfinished repairs, validation ticket excluded from completion, declined/skipped checks and frontier readiness. No live API/security scans, installation, deployment or Git publication without their own authorization.
