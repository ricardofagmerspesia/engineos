# Security Rules — always on

## Secrets
- DO load secrets from environment/secret manager only; reference by name in config templates (`${DB_PASSWORD}`).
- DO add secret patterns to .gitignore and scan before commit (`.env*`, `*.pem`, `credentials*`).
- DON'T put keys in code, settings files committed to git, prompts, logs, or error messages.
- DON'T hardcode passwords, or any credential, anywhere a production deploy can reach:
  no literal passwords in code or config, no `process.env.DB_PASSWORD ?? 'admin'`
  fallbacks, no default admin accounts, no seed users with fixed passwords, no
  "temporary" values behind an `if (env === 'prod')` guard. Production reads the
  secret from the environment/secret manager or crashes at startup — it never falls
  back to a literal.
- Local-only defaults (dev `docker-compose`, test fixtures) are the single exception,
  and only when they are scoped to a non-production environment, shared with no real
  system, and absent from every production image, chart, and env file.
- If a secret ever touches git history or a shared file: rotate it immediately AND scrub history. Removal is not enough.

## Input validation
- DO validate ALL external input at the boundary: HTTP bodies, query params, headers, webhook payloads, file uploads, LLM outputs.
- DO validate by allowlist (what IS valid), not blocklist.
- DO limit sizes: body size, array lengths, string lengths, file sizes.

## Injection
- DO use parameterized queries / ORM bindings — never string-concatenate SQL.
- DO escape/encode output per context (HTML, attribute, URL) — frameworks do this; don't bypass with `dangerouslySetInnerHTML`/`v-html` on untrusted data.
- DON'T pass user input to shell commands, `eval`, dynamic imports, or file paths without strict validation.

## AuthN / AuthZ
- DO enforce authorization on every endpoint server-side — UI hiding is not access control.
- DO check object-level access (user owns resource X), not just role — IDOR is the #1 real-world hole.
- DO use short-lived tokens; httpOnly+secure+sameSite cookies for sessions.
- DON'T roll your own crypto, password hashing (use argon2/bcrypt), or session management.

## Data
- DO encrypt in transit everywhere (TLS, including service-to-service).
- DO minimize: collect/store/log only data you need. PII never in logs.
- DO use constant-time comparison for secrets/tokens.

## Dependencies & supply chain
- DO run `npm audit` / `pip-audit` (or `uv audit`) / dependabot; patch criticals within days, not quarters.
- DO pin lockfiles; review postinstall scripts and `setup.py`/build hooks of new deps.

## Pre-merge checklist (apply on review intent)
- [ ] No secrets in diff
- [ ] No hardcoded passwords or credential fallbacks reachable from a production deploy
- [ ] All new inputs validated (body, params, headers, files)
- [ ] AuthZ on every new endpoint, object-level where applicable
- [ ] No raw SQL string building / no unescaped output
- [ ] Errors don't leak internals (stack traces, queries, paths) to clients
- [ ] New deps justified and audited
