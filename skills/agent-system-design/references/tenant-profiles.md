# Tenant profiles

*Reference for steps 2, 6 and 8 of the design form (`references/form.md`); folded into every catalog pattern. Grounding: `labv-opensearch-agent-demo/backend`, cited as `file:line`. Per-role model construction is the `langgraph-patterns` skill's §6; this file covers where the profile comes from and what it may contain.*

A profile is the per-tenant bundle of connection, credentials, model roles and curated-context paths, resolved once per request from the token and bound into every tool, registry and model at graph build. The model never sees it; the UI sees a projection with no secrets.

## 1. Resolution — from the JWT claim, nothing else

- The tenant is the token's `company` claim (`api/auth.py:55-66`); the profile is looked up by `company_id` (`config/data_profile.py:312-325`); an unmapped tenant falls back to the default profile and still gets a tenant-filtered session. The client never picks the profile (`data/profiles.yaml:6-7`).
- Internal principals — `_`-prefixed ids such as `_warmup` — are the compile-only convention that resolves to shared credentials and skips tenant filters downstream. A decoded token claiming one is rejected at auth with 401 (`api/auth.py:60-64`); the context registry and fact generation aggregate nothing for them either (`services/index_context_registry.py:171`, `services/index_facts.py:125-131`).
- A profile-level `data_company_id` may override the JWT tenant for demo or dev snapshots (`config/tenant_resolution.py:10-35`); it is a profile decision, never a request parameter.

## 2. The file — `${ENV}` placeholders, no secret in YAML

```yaml
version: 1
default_profile: demo
default_roles:                       # per-role model defaults, see §3
  router:    { deployment: "${ROUTER_DEPLOYMENT}", flavor: "gpt5_1" }
  dsl:       { deployment: "${DSL_DEPLOYMENT}",    flavor: "gpt5_1" }
  evaluator: { deployment: "${DSL_DEPLOYMENT}",    flavor: "gpt5_1" }
profiles:
  acme:
    label: "Acme (private)"
    company_id: "<ObjectId carried by the JWT company claim>"
    index_prefix: labv-platform-
    paths: { index_context: profiles/acme/index_context.yaml, semantic_layer: profiles/acme/semantic_layer.yaml }
    opensearch: { url: "${OPENSEARCH_URL}", username: "${OPENSEARCH_USERNAME}", password: "${OPENSEARCH_PASSWORD}", user_password: "${OPENSEARCH_USER_PASSWORD}" }
    openai: { flavor: "gpt5_1", endpoint: "${AZURE_OPENAI_ENDPOINT_ACME}", api_key: "${AZURE_OPENAI_API_KEY_ACME}", deployment: "${AZURE_OPENAI_CHAT_DEPLOYMENT_NAME_ACME}", api_version: "${AZURE_OPENAI_API_VERSION_ACME}" }
    # optional: roles: { narrator: { deployment: "..." } }   — overrides default_roles per role
```

- `${VAR}` is substituted from the environment at load (`config/data_profile.py:16,63-80`); an empty result is logged, and no literal secret ever sits in git (`profiles.yaml:2`). Under the fail-closed settings of rules/backend-python.md the env vars themselves are `SecretStr` fields.
- Paths are relative to the data dir; `data/profiles/<tenant>/` holds the overlay files, `_default/` the base.
- The loader validates into a Pydantic `DataProfile` (`data_profile.py:22-48`) and warns when two profiles map the same `company_id` (`:254-268`).

## 3. Per-role models — defaults with per-tenant overrides

- Roles: `router`, `dsl`, `evaluator`, `narrator`, `title`, `document`, `compute`. Top-level `default_roles` applies only to profiles **without** their own `openai` connection; a tenant on its own Azure resource keeps its config and opts in with an explicit `roles` block (`data_profile.py:194-201`, `profiles.yaml:16-21`).
- A role spec overrides field by field — a role naming only a `deployment` keeps the tenant's endpoint and key (`config/settings.py:348-354`).
- **Never mix**: a forced flavor (the narrator pinned to a cheaper flavor under a reasoning-model tenant) takes that flavor's globals wholesale, never the tenant's endpoint with another flavor's deployment — that pairing is a 404 (`settings.py:338-359`).
- `build_model(profile, role=…)` is the only constructor (langgraph-patterns §6); internal roles run with `nostream`.

## 4. Merge — `_default` plus tenant overlay

The curated context files merge with declared rules — `agg_fields` union, `fields` override-by-key, `notes` concatenate (`services/index_context_registry.py:124-135`) — then `hand_notes.yaml`, then the machine facts (`:186-205`); see `references/context-enriched-tools.md` §1. The profile entry itself does not merge: one `profiles.yaml` entry is the whole connection; only its curated files layer over `_default`.

## 5. Secret-free projection for the UI

The API lists `ProfileInfo(id, label, default)` and nothing else (`data_profile.py:51-56,328-335`); URLs, usernames, keys and paths never leave the backend. The output sanitizer redacts credential patterns and endpoint URLs from any answer as defense in depth (`utils/guardrails.py:90-144`; rules/security.md owns the no-secrets rule).

## 6. Credentials scoped per tenant at construction

`effective_profile(profile, company_id, opensearch_principal_id=…)` returns a **copy** of the profile carrying the tenant's own store login (`user_company_<tenant>`) and that user's password, resolved in priority order and never the admin password (`config/opensearch_credentials.py:22-64`). That copy is what every tool closure, the context registry and the document search receive (`graph/workflow.py:75-76,109,174`); the graph is compiled and cached per `(profile, tenant)` (`services/agent_service.py:55-85`). Session storage keys derive from the same claims — `company__user__profile__session`, never the raw client id (`utils/session_scope.py:4-22`).

## 7. Single-agent projects use it too

A grounded-pipeline or typed-pipeline service has no roles table, but the same three facts hold: the tenant comes from the token (`Depends(current_principal)` in the `python-patterns` skill), the retrieval adapter refuses an empty tenant (`labv-assist/app/adapters/opensearch_documents.py:139-141`), and the model connection comes from settings, not from the request. Start with one profile (`_default`) and the `${ENV}` file; add per-tenant entries when a tenant needs its own resource, overlay or model — the loader and the merge rules do not change.

## Checklist for the form

- Step 2: which roles exist, their default model, which tenants override them and why.
- Step 6: the session-key derivation and what it scopes (memory, artifacts, last data).
- Step 8: where the tenant is bound (construction, not call), which guards re-check it, how internal principals are rejected at auth.
- Step 10: profile id and tenant on every span (rules/observability.md); token accounting per role.
