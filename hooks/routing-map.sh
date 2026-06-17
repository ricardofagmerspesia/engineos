#!/usr/bin/env bash
# Canonical EngineOS path -> routing map. Sourced by route-before-change.sh.
# THIS FILE IS AUTHORITATIVE. The router table in CLAUDE.md is a human-readable
# mirror; keep it in sync with this. The /engineos:audit orchestrator routes by
# domain token (not file pattern), so it does not duplicate this mapping.

# route_excluded <path> -> exit 0 if the path is a meta/non-code file that should
# get NO routing (prevents recursive/noisy routing on our own scaffolding).
route_excluded() {
  case "$1" in
    */changes/*|*/archived/*|*/memory/*|*/docs/*|*/hooks/*) return 0 ;;
  esac
  case "${1##*/}" in
    *.md|*.lock|package-lock.json|pnpm-lock.yaml|yarn.lock) return 0 ;;
  esac
  return 1
}

# route_for_path <path> -> echo a guidance string (rules | skill | agent), or
# nothing for the base-only default. Assumes the path is NOT excluded.
route_for_path() {
  local f="$1" base="${1##*/}"

  # security-sensitive — cross-cutting, checked first
  case "$f" in
    *auth*|*guard*|*middleware*|*secret*|*.env|*/.env.*|*credential*)
      echo "rules/security.md | agent:security-reviewer"; return 0 ;;
  esac

  # tests
  case "$base" in
    *.spec.*|*.test.*|*.e2e-spec.*)
      echo "rules/testing.md | agent:test-writer"; return 0 ;;
  esac

  # backend (NestJS shapes)
  case "$base" in
    *.controller.ts|*.service.ts|*.module.ts|*.resolver.ts|*.dto.ts|*.entity.ts|*.gateway.ts|*.repository.ts)
      echo "rules/backend.md+architecture.md+testing.md | skill:nestjs-patterns | agent:backend-coordinator"; return 0 ;;
  esac

  # dba
  case "$f" in
    *.sql|*/migrations/*|*/migration/*)
      echo "rules/architecture.md | agent:dba-coordinator (postgres/oracle)"; return 0 ;;
  esac

  # devops / IaC
  case "$f" in
    *.tf|*.tfvars|*Dockerfile*|*/.github/workflows/*|*/helm/*|*/k8s/*|*/kustomize/*)
      echo "rules/architecture.md | agent:devops-coordinator (kubernetes/gcp/cicd)"; return 0 ;;
  esac

  # frontend
  case "$base" in
    *.tsx|*.jsx)
      echo "rules/frontend.md+architecture.md+testing.md | skill:react-patterns | agent:frontend-coordinator"; return 0 ;;
  esac
  case "$f" in
    *.css|*.scss|*/components/*|*/pages/*)
      echo "rules/frontend.md+architecture.md | skill:react-patterns | agent:frontend-coordinator"; return 0 ;;
  esac

  # LLM / agent work
  case "$f" in
    *prompt*|*rag*|*eval*|*embedding*|*llm*)
      echo "rules/llm-apps.md | skill:llm-engineering | agent:ia-coordinator"; return 0 ;;
  esac

  return 0
}
