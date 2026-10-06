# API contracts and parallel delivery

Unreleased — MINOR guidance tightening; no public path or return-envelope rename.

NestJS/React delivery now records authoritative API schemas, ownership and contract
revisions before dependent work starts. Added templates/api-contract.md. Consumers
use transport types without backend framework dependencies; static type generation
does not substitute for runtime input validation.

Parallel implementation uses a task dependency ledger, exclusive paths and host
capacity. Integrated prerequisites release ready tasks without unrelated wave
barriers; contract drift pauses affected consumers until the owner resolves it.
The implement command and Cursor adapter use the same procedure. These scheduling
steps are executor guidance, not a new automatic runtime scheduler.

React skill guidance now follows the established final-stage testing approval
policy. Existing project/tooling choices and public handoff headings are preserved.
