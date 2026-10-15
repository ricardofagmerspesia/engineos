# GPT and Claude decision framework

This feature lives in the existing local Next.js console. EngineOS's deterministic
CLI/kernel remains model-free. Assessments are advisory input: TypeScript owns
scores, eligibility, evidence gates and approval validity. READY never authorizes
an external action. There is no action-execution endpoint.

## Setup

Use Node 22 or newer for the console/worker, as required by its existing
better-sqlite3 dependency. The standalone EngineOS CLI's Node floor is unchanged.
Install the repository and console dependencies through their existing manifests.
The feature adds only an exact Zod runtime dependency; provider calls use native
fetch with provider-supported structured-output schemas.

Configure server-side environment variables, keeping actual keys out of files
committed to the repository:

```sh
DECISIONS_ENABLED=true
DECISIONS_IDENTITY_MODE=local
OPENAI_API_KEY=<provided through your secret environment>
ANTHROPIC_API_KEY=<provided through your secret environment>
DECISIONS_OPENAI_MODEL=<structured-output model available to your account>
DECISIONS_ANTHROPIC_MODEL=<structured-output model available to your account>
DECISIONS_SHADOW_MODE=true
DECISIONS_HUMAN_REVIEW_MODE=true
DECISIONS_LOW_RISK_READINESS=false
```

Model names have no guessed default. Account/model compatibility requires an
explicit live check; the offline tests do not establish live model availability.
See the provider module's configuration for validated optional budgets, deadlines,
token limits and versioned tariffs. Unknown prices are reported as unknown.

From `console/`, build and operate the worker separately:

```sh
npm run decisions:build
npm run decisions:worker
```

Start the console using its existing `npm run dev` or `npm run build` followed by
`npm run start`, then open `/decisions`. Requests enqueue durable work; they do not
hold a provider job in the HTTP request lifecycle. Stop the worker with SIGINT or
SIGTERM. Never run more hosts against a local SQLite file over a network filesystem.

The additive `0001_decisions.sql` migration applies only when the decision runtime
opens the local store, not during module import or frontend build. Preserve the
existing database and back it up before first enabling the feature. The migration
adds decision tables and does not rewrite capability tables. Production migrations
or deployment are separate explicitly authorized operations.

## Identity and approvals

Local mode uses one server-controlled OS operator identity. Tenant and actor IDs
from browser bodies/headers are never authority. A single operator cannot meet a
policy requiring two distinct authenticated reviewers.

Multi-user mode requires a trusted identity resolver installed through the backend
integration boundary. Until it is configured, access fails closed. Resolve identity
from your authenticated session, validate tenant membership and map reviewer roles
on the server. Do not install a resolver that trusts unsigned client-controlled
headers. The default local console is not an Internet-facing authentication service.

Reviews bind the current decision revision, policy version, report hash, selected
eligible option, reviewer, disposition, rationale, timestamp and optional expiry.
Report or input changes invalidate bound approvals. Backend transactions and an
expected version prevent simultaneous stale approvals from appearing current.

## Evidence and scoring

Supplied evidence is frozen with its excerpt hash, observed time and optional
expiry. Hash/freshness checks and valid evidence IDs are distinct from factual
support. Human evidence checks bind the option and criterion/constraint/claim they
support or contradict. A provider's claimed hard-constraint failure alone cannot
make an option definitively ineligible.

Every criterion is utility on a 0–100 scale, with higher better. Explain conversion
of cost, delay and risk in the rubric. Weights normalize against the full positive
total; missing positively weighted scores do not become zero or disappear. Bounds
are plausible utility ranges, never calibrated probabilities.

Gates accumulate all reasons in conservative precedence. Disagreement and one
bounded anonymous challenge round preserve original assessments. Agreement after
the challenge is not independent verification. Sensitivity outcomes come from
explicit deterministic scenarios rather than invented robustness claims.

## Operational boundaries and rollout

Begin in shadow mode, inspect evidence gaps and reviewer overrides, then enable
human-review mode. Only after real provider, identity, storage and recovery checks
pass should an operator consider low-risk readiness. High risk and irreversibility
retain human gates. Keep per-run and tenant budgets finite and monitor provider
failures, reservation exhaustion, latency and unknown cost.

Use synthetic/non-sensitive decisions until retention, at-rest storage protection,
redaction and trusted identity requirements for your deployment are verified.
Redaction is defense in depth, not permission to submit arbitrary confidential data.
The default SQLite store is local and is not represented as key-managed encrypted
storage. External evidence fetching is intentionally absent, so the app introduces
no arbitrary-URL fetch or SSRF surface.

Rollback: stop the worker and disable the feature. Additive tables can remain
dormant while prior console capability functions continue. Restoring a database
backup or explicitly removing decision tables is an operator-controlled destructive
operation, never an automatic rollback step. Audit/report records are append-only;
retention deletion needs a separately reviewed operational procedure.

Offline tests use mocked provider transports and disposable databases. Live smoke
tests require separately provided credentials and explicit opt-in. Synthetic
evaluation fixtures are not expert-reviewed rankings; expert review remains an
explicit rollout prerequisite. See the feature change record for actual checks
and unresolved limitations rather than assuming production readiness.
