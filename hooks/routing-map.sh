#!/usr/bin/env bash
# Canonical EngineOS path -> routing map. Sourced by route-before-change.sh.
# THIS FILE IS AUTHORITATIVE for file-pattern routing. The stack/domain rows of the
# CLAUDE.md router table are the human-readable mirror; keep them in sync with this.
# (The /engineos:audit orchestrator routes by domain token, not file pattern, so it
# does not duplicate this mapping.)
#
# Path-segment patterns match against "/$f" (leading-slash normalized) so both
# absolute and relative input paths work. Basename patterns match against "$base".

# Resolve EngineOS's own hooks/ and docs/ dirs (this file lives at hooks/routing-map.sh
# in the EngineOS repo/plugin install). Exclusions below are restricted to these exact
# paths so we never swallow a consumer project's own src/hooks/ or product docs/.
_EOS_HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_EOS_DOCS_DIR="$(cd "$_EOS_HOOKS_DIR/.." && pwd)/docs"

# route_excluded <path> -> exit 0 if the path is a meta/non-code file that should
# get NO routing (prevents recursive/noisy routing on our own scaffolding).
route_excluded() {
  case "$1" in
    */.engineos/*) return 0 ;;
  esac
  case "$1" in
    "$_EOS_HOOKS_DIR"/*|"$_EOS_DOCS_DIR"/*) return 0 ;;
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

  # security-sensitive — cross-cutting, checked first. Delimiter-bounded so
  # "authors/author.controller.ts" (backend) doesn't collide with "src/auth/*"
  # (security): path segments are whole directory components, basenames are
  # dot-delimited. Unanchored substrings ("*auth*") used to catch both.
  case "/$f" in
    */auth/*|*/guards/*|*/middleware/*|*/secrets/*|*/credentials/*|*/.env.*)
      echo "rules/security.md | agent:security-reviewer"; return 0 ;;
  esac
  case "$base" in
    auth.*|*.auth.*|*.guard.*|*.middleware.*|*.strategy.ts|.env|.env.*|\
    secret.*|*.secret.*|*.secrets.*|credential.*|*.credential.*|*.credentials.*)
      echo "rules/security.md | agent:security-reviewer"; return 0 ;;
  esac

  # tests
  case "$base" in
    *.spec.*|*.test.*|*.e2e-spec.*)
      echo "rules/testing.md | agent:test-writer"; return 0 ;;
  esac

  # backend (NestJS shapes) — includes queue/pipeline suffixes
  case "$base" in
    *.controller.ts|*.service.ts|*.module.ts|*.resolver.ts|*.dto.ts|*.entity.ts|\
    *.gateway.ts|*.repository.ts|*.processor.ts|*.consumer.ts|*.job.ts|\
    *.interceptor.ts|*.pipe.ts|*.filter.ts)
      echo "rules/backend.md+architecture.md+data.md+testing.md+observability.md | skill:nestjs-patterns | agent:backend-coordinator"; return 0 ;;
  esac

  # dba
  case "$base" in
    *.sql)
      echo "rules/data.md+architecture.md | agent:dba-coordinator (postgres/oracle)"; return 0 ;;
  esac
  case "/$f" in
    */migrations/*|*/migration/*)
      echo "rules/data.md+architecture.md | agent:dba-coordinator (postgres/oracle)"; return 0 ;;
  esac

  # store-builder (iOS/Android release plumbing) — MUST precede mobile: this arm
  # only matches build/release-specific files, so ordinary RN screens still fall
  # through to the mobile arm below.
  case "/$f" in
    */fastlane/*|*/ios/*/Info.plist|*/ios/Info.plist)
      echo "rules/security.md (signing) | agent:ios-builder"; return 0 ;;
  esac
  case "$f" in
    *.xcodeproj/*)
      echo "rules/security.md (signing) | agent:ios-builder"; return 0 ;;
  esac
  case "$base" in
    Podfile|exportOptions*.plist)
      echo "rules/security.md (signing) | agent:ios-builder"; return 0 ;;
  esac
  case "/$f" in
    */android/*.gradle*|*/android/*/AndroidManifest.xml)
      echo "rules/security.md (signing) | agent:android-builder"; return 0 ;;
  esac
  case "$base" in
    *.keystore)
      echo "rules/security.md (signing) | agent:android-builder"; return 0 ;;
  esac

  # devops / IaC
  case "$base" in
    *.tf|*.tfvars|Dockerfile*|docker-compose*.y*ml|Jenkinsfile|.gitlab-ci.yml)
      echo "rules/architecture.md+observability.md | agent:devops-coordinator (kubernetes/gcp/cicd)"; return 0 ;;
  esac
  case "/$f" in
    */.github/workflows/*|*/helm/*|*/k8s/*|*/kustomize/*|*/terraform/*)
      echo "rules/architecture.md+observability.md | agent:devops-coordinator (kubernetes/gcp/cicd)"; return 0 ;;
  esac

  # mobile (React Native) — MUST precede frontend: mobile screens are .tsx too, and
  # they belong to mobile-coordinator, not frontend-coordinator.
  case "/$f" in
    */mobile/*|*/android/*|*/ios/*|*/react-native/*)
      echo "rules/frontend.md+architecture.md+backend.md+testing.md+observability.md (adapt to React Native) | agent:mobile-coordinator"; return 0 ;;
  esac
  case "$base" in
    *.native.ts|*.native.tsx|*.native.js|*.native.jsx)
      echo "rules/frontend.md+architecture.md+backend.md+testing.md+observability.md (adapt to React Native) | agent:mobile-coordinator"; return 0 ;;
  esac

  # frontend
  case "$base" in
    *.tsx|*.jsx)
      echo "rules/frontend.md+architecture.md+testing.md | skill:react-patterns | agent:frontend-coordinator"; return 0 ;;
  esac
  # NOTE: */app/* is deliberately NOT matched here. It collides with backend `src/app/`
  # (NestJS) and any non-Next `app/` dir, and adds nothing Next-specific that the
  # .tsx/.jsx and *.css arms above don't already catch.
  case "$base" in
    *.css|*.scss)
      echo "rules/frontend.md+architecture.md+testing.md | skill:react-patterns | agent:frontend-coordinator"; return 0 ;;
  esac
  case "/$f" in
    */components/*|*/pages/*)
      echo "rules/frontend.md+architecture.md+testing.md | skill:react-patterns | agent:frontend-coordinator"; return 0 ;;
  esac

  # LLM / agent work — anchored to whole path segments and delimiter-bounded
  # basenames. Unanchored globs mis-fired badly: "*rag*" caught sto|rag|e/ and
  # pa|rag|raph/, "*eval*" caught |eval|uate.ts.
  case "/$f" in
    */prompt/*|*/prompts/*|*/rag/*|*/evals/*|*/eval/*|*/embeddings/*|*/llm/*)
      echo "rules/llm-apps.md | skill:llm-engineering | agent:llm-coordinator"; return 0 ;;
  esac
  case "$base" in
    prompt*|rag.*|embedding*|llm*|eval.*|evals.*|*.prompt.*|*.rag.*|*.embedding*|*.llm.*|*.eval.*|*.evals.*)
      echo "rules/llm-apps.md | skill:llm-engineering | agent:llm-coordinator"; return 0 ;;
  esac

  return 0
}
