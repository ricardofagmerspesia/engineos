> Active runtime: Mastra on Node.js/TypeScript inside NestJS providers. Python
> citations are historical design provenance, not JS APIs/tooling. Resolve APIs
> against installed dependencies. Tests/evals are plans until integration and
> explicit current-task final-stage approval.

# Tenant profiles

Form steps 2/6/8 reference; historical sources under
`labv-opensearch-agent-demo/backend`. A profile bundles credentials,
connections, roles and curated paths. Resolve from authenticated token once per
request and bind through NestJS providers to tools/registry/models. Models never
see profiles; UI gets only a secret-free projection. Implement via mastra-patterns.

## 1. Resolution

JWT company claim identifies tenant; map company_id to profile, falling back to
default **with tenant filtering still enforced** (`api/auth.py:55-66`,
`config/data_profile.py:312-325`, `data/profiles.yaml:6-7`). Client never picks
profile. Internal _-ids are compile-only shared-credential conventions; reject
such decoded tokens with 401 and perform no registry/fact aggregation
(`api/auth.py:60-64`, `services/index_context_registry.py:171`,
`services/index_facts.py:125-131`). Profile data_company_id may override tenant
for approved demo/dev snapshots, never request input
(`config/tenant_resolution.py:10-35`).

## 2. Secret-free configuration

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

Substitute `${VAR}` from environment; log unresolved/empty values without
secrets (`config/data_profile.py:16,63-80`, `profiles.yaml:2`). Validate/redact
at Node composition root with strict zod and duplicate-company detection
(historical loader `data_profile.py:22-48,254-268`). Paths are data-dir-relative;
_default supplies base files, profiles/<tenant> overlays.

## 3. Role models

Roles: router/dsl/evaluator/narrator/title/document/compute. default_roles applies
only without a profile's own openai connection; tenants with dedicated resources
opt in using explicit roles (`data_profile.py:194-201`, `profiles.yaml:16-21`).
Merge role fields individually: deployment-only keeps tenant endpoint/key
(`config/settings.py:348-354`). Forced flavor switches **all** flavor globals;
never pair another flavor's deployment with the tenant endpoint (`:338-359`).
Resolve server-side and construct Mastra agents in NestJS providers; internal role
output never streams directly to users. Historical build_model/nostream names are
provenance, not active APIs.

## 4. Overlay and UI

Curated files merge agg_fields union/fields keyed override/notes concatenate,
then hand_notes and machine facts (`services/index_context_registry.py:124-135,186-205`;
`references/context-enriched-tools.md`). Profile connection entries never merge:
one profiles.yaml entry is complete.

Expose only ProfileInfo(id,label,default) (`data_profile.py:51-56,328-335`);
backend URLs/usernames/keys/paths remain private. Answer sanitization also redacts
credential patterns/endpoint URLs (`utils/guardrails.py:90-144`, security rules).

## 5. Construction and storage scope

Copy effective_profile with user_company_<tenant> login/password in priority order,
never admin password (`config/opensearch_credentials.py:22-64`). Pass it to
every tool, context registry and document search (`graph/workflow.py:75-76,109,174`);
cache compiled execution per (profile,tenant)
(`services/agent_service.py:55-85`). Session keys derive authenticated
company__user__profile__session, never raw client id (`utils/session_scope.py:4-22`).

Single-agent pipelines follow the same policy: JWT tenant, retrieval refusing
empty tenant (`labv-assist/app/adapters/opensearch_documents.py:139-141`),
model settings server-side. Start with _default/env configuration; add tenant
resources/overlays/models only when needed without changing resolution/merge rules.

## Form checklist

- §2 roles/default models/tenant overrides and reasons.
- §6 derived session keys for memory/artifacts/last data.
- §8 construction binding, rechecks, internal-principal auth rejection.
- §10 profile/tenant span tags and all per-role token accounting.
