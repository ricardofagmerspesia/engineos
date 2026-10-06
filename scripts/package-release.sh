#!/usr/bin/env bash
# package-release.sh — builds the EngineOS distribution artifact (E02).
#
# Principles (EngineOS 2.0 plan, E02):
#   - The package comes from a COMMIT, never from the working tree: `git archive`
#     does not see node_modules, caches, the console database, .env or a dirty
#     worktree.
#   - Explicit path allowlist: what is not listed does not get in.
#   - LF guaranteed by the repository attributes; the exec mode of the .sh files
#     is verified on the final artifact.
#   - Manifest + checksum: every published file is traceable to the commit.
#
# Usage:
#   scripts/package-release.sh [--commit <ref>] [--out <dir>] [--with-ide-mirrors] [--no-verify]
#
# Output in <out>/:
#   engineos-<version>-<shortsha>.zip
#   engineos-<version>-<shortsha>.zip.sha256
#   engineos-<version>-<shortsha>.MANIFEST.txt

set -euo pipefail

COMMIT="HEAD"
OUT_DIR="dist-release"
WITH_IDE_MIRRORS=0
VERIFY=1

while [ $# -gt 0 ]; do
  case "$1" in
    --commit) COMMIT="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    --with-ide-mirrors) WITH_IDE_MIRRORS=1; shift ;;
    --no-verify) VERIFY=0; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# --- Allowlist -------------------------------------------------------------
# Runtime surface + release documentation. Out of the list, by explicit
# decision: .engineos (development history), .github (CI), node_modules and
# build/ (reinstallable), local console data.
PATHS=(
  # Runtime assets that live under .engineos/. The change history
  # (.engineos/archived, .engineos/changes/2026-*) is development material and
  # stays out; the template and the READMEs are read by the checks and skills.
  .engineos/README.md
  .engineos/archived/README.md
  .engineos/changes/README.md
  .engineos/changes/_template.md
  .engineos/memory/README.md
  .claude-plugin
  .gitattributes
  AGENTS.md
  CLAUDE.md
  CONTEXT.md
  LICENSE
  README.md
  agents
  commands
  console
  dist
  docs
  evals
  hooks
  install.ps1
  install.sh
  package-lock.json
  package.json
  patterns
  registries
  rules
  scripts
  skills
  skills-lock.json
  src
  templates
  tsconfig.json
)
# Pinned third-party skills: install.sh / install.ps1 step 4a2 link
# .agents/skills/<name> for every skills-lock.json entry whose source is one of
# these two, so a zip install needs exactly those directories even without the
# IDE mirrors. Read from the COMMIT, like everything else packaged here. Names
# are validated as install.sh does, and a name EngineOS ships under skills/ is
# left out because the installers never link it (EngineOS wins). A pinned skill
# not vendored at the commit fails packaging: the artifact would ship a lock the
# installer cannot honour.
PINNED_SKILL_PATHS=()
if [ "$WITH_IDE_MIRRORS" -eq 1 ]; then
  PATHS+=(.agents .cursor .trae .windsurf)
else
  command -v node >/dev/null 2>&1 || { echo "error: node is required to read skills-lock.json for the pinned skills" >&2; exit 1; }
  pinned_names="$(git show "$COMMIT:skills-lock.json" | node -e '
    const sources = new Set(["mattpocock/skills", "tech-leads-club/agent-skills"]);
    const lock = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const skills = lock && typeof lock.skills === "object" && lock.skills !== null ? lock.skills : {};
    for (const [name, entry] of Object.entries(skills)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) continue;
      if (entry && sources.has(entry.source)) console.log(name);
    }
  ')" || { echo "error: could not read skills-lock.json at $COMMIT" >&2; exit 1; }
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    if [ -n "$(git ls-tree -d "$COMMIT" -- "skills/$name")" ]; then
      continue
    fi
    if [ -z "$(git ls-tree -d "$COMMIT" -- ".agents/skills/$name")" ]; then
      echo "error: pinned skill $name (skills-lock.json) is not vendored at .agents/skills/$name in $COMMIT" >&2
      exit 1
    fi
    PINNED_SKILL_PATHS+=(".agents/skills/$name")
  done <<EOF
$pinned_names
EOF
  if [ "${#PINNED_SKILL_PATHS[@]}" -gt 0 ]; then
    PATHS+=("${PINNED_SKILL_PATHS[@]}")
  fi
fi

# --- Artifact identity -----------------------------------------------------
SHA="$(git rev-parse "$COMMIT")"
SHORT="$(git rev-parse --short "$COMMIT")"
VERSION="$(git show "$COMMIT:package.json" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -n "$VERSION" ] || { echo "error: could not read the version from package.json at $COMMIT" >&2; exit 1; }

# Plugin manifests must agree with package.json (E01). The marketplace
# manifest is the version a plugin-mode consumer actually resolves, so a bump
# that misses it publishes one version under two numbers.
PLUGIN_VERSION="$(git show "$COMMIT:.claude-plugin/plugin.json" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
if [ "$PLUGIN_VERSION" != "$VERSION" ]; then
  echo "error: version mismatch — package.json=$VERSION plugin.json=$PLUGIN_VERSION" >&2
  exit 1
fi
MARKET_VERSION="$(git show "$COMMIT:.claude-plugin/marketplace.json" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
if [ "$MARKET_VERSION" != "$VERSION" ]; then
  echo "error: version mismatch — package.json=$VERSION marketplace.json=$MARKET_VERSION" >&2
  exit 1
fi

BASE="engineos-${VERSION}-${SHORT}"
mkdir -p "$OUT_DIR"
ZIP="${OUT_DIR}/${BASE}.zip"
MANIFEST="${OUT_DIR}/${BASE}.MANIFEST.txt"

echo "commit .......... $SHA"
echo "version ......... $VERSION"
echo "artifact ........ $ZIP"

# --- Packaging -------------------------------------------------------------
rm -f "$ZIP" "$ZIP.sha256" "$MANIFEST"
# core.autocrlf/core.eol are forced off: the published bytes must be the commit's
# bytes, whatever a Windows packager's global git config says about EOL.
git -c core.autocrlf=false -c core.eol=lf archive --format=zip -9 --prefix="engineos-${VERSION}/" -o "$ZIP" "$COMMIT" -- "${PATHS[@]}"

# --- Manifest --------------------------------------------------------------
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
git -c core.autocrlf=false -c core.eol=lf archive --format=tar "$COMMIT" -- "${PATHS[@]}" | tar -x -C "$STAGE"

{
  echo "# EngineOS release manifest"
  echo "# version:    $VERSION"
  echo "# commit:     $SHA"
  echo "# generated:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# files:      $(find "$STAGE" -type f | wc -l | tr -d ' ')"
  echo "#"
  echo "# sha256  path"
  ( cd "$STAGE" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | while IFS= read -r f; do
      printf '%s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$f"
    done )
} > "$MANIFEST"

( cd "$OUT_DIR" && sha256sum "${BASE}.zip" > "${BASE}.zip.sha256" )

# --- Artifact verification -------------------------------------------------
if [ "$VERIFY" -eq 1 ]; then
  echo "--- verification ---"
  fail=0

  # Libraries loaded with `source`: they are never invoked directly and so must
  # not carry the exec bit. Every other *.sh must.
  is_sourced_lib() {
    case "$1" in
      ./hooks/layout-manifest.sh|./hooks/scaffold-layout.sh) return 0 ;;
      *) return 1 ;;
    esac
  }

  # 1. No CRLF in any file a POSIX parser consumes. Read from the COMMIT, not
  #    from the extracted stage: the stage reflects whatever EOL conversion the
  #    extractor applied, so a clean stage proves nothing about the artifact.
  #    *.ps1 stays out of the list — PowerShell is fine with CRLF.
  #    The CR is spelled as a PCRE escape, never as a raw byte in argv: under
  #    Git Bash a raw CR does not survive the MSYS -> native git.exe argument
  #    conversion, the pattern degrades and every text file matches.
  crlf="$(git grep -P -lI '\r' "$COMMIT" -- "${PATHS[@]}" 2>/dev/null \
    | cut -d: -f2- \
    | grep -E '\.(sh|md|json|jsonl|ts|tsx|mjs|cjs|yaml|yml|py)$' || true)"
  if [ -n "$crlf" ]; then echo "FAIL CRLF in: $(echo "$crlf" | head -5)"; fail=1; else echo "ok   no CRLF in the POSIX-parsed formats"; fi

  # 2. Executable scripts carry the exec bit; sourced libraries do not. Modes are
  #    read from the COMMIT because `[ -x ]` on MSYS answers from the shebang,
  #    not from the tracked mode, so the check passed there for free.
  noexec=""
  wrongexec=""
  while IFS="$(printf '\t')" read -r meta path; do
    case "$path" in *.sh) ;; *) continue ;; esac
    mode="${meta%% *}"
    if is_sourced_lib "./$path"; then
      [ "$mode" = "100644" ] || wrongexec="$wrongexec $path($mode)"
    else
      [ "$mode" = "100755" ] || noexec="$noexec $path($mode)"
    fi
  done <<EOF
$(git ls-tree -r "$COMMIT" -- "${PATHS[@]}" | LC_ALL=C sort -k4)
EOF
  if [ -n "$noexec" ]; then echo "FAIL missing exec bit:$noexec"; fail=1; else echo "ok   executable scripts carry mode 100755"; fi
  if [ -n "$wrongexec" ]; then echo "FAIL sourced library marked executable:$wrongexec"; fail=1; else echo "ok   sourced libraries carry mode 100644"; fi

  # 3. Nothing reinstallable, cached or local state got in.
  junk="$( cd "$STAGE" && find . \( -name node_modules -o -name '.next' -o -name build -o -name '*.db' -o -name '*.sqlite*' -o -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' \) 2>/dev/null || true )"
  if [ -n "$junk" ]; then echo "FAIL unexpected content: $(echo "$junk" | head -5)"; fail=1; else echo "ok   no deps, caches or local state"; fi

  # 4. Secret scan. A hit requires manual triage; the absence of a hit is not
  #    proof of the absence of a secret.
  secrets="$( cd "$STAGE" && grep -rIlE '(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,})' . 2>/dev/null || true )"
  if [ -n "$secrets" ]; then echo "WARNING possible secret in: $(echo "$secrets" | head -5)  (manual triage required)"; fail=1; else echo "ok   secret scan found nothing"; fi

  # 5. Lockfiles present: reproducible install.
  for lf in package-lock.json console/package-lock.json; do
    if [ -f "$STAGE/$lf" ]; then echo "ok   lockfile $lf"; else echo "FAIL lockfile missing: $lf"; fail=1; fi
  done

  # 6. Installer entrypoints present.
  for f in install.sh install.ps1 .claude-plugin/plugin.json hooks/hooks.json; do
    if [ -f "$STAGE/$f" ]; then echo "ok   $f"; else echo "FAIL missing: $f"; fail=1; fi
  done

  # 7. The pinned skills step 4a2 links are in the artifact, each with its SKILL.md.
  if [ "${#PINNED_SKILL_PATHS[@]}" -gt 0 ]; then
    missing_pinned=""
    for p in "${PINNED_SKILL_PATHS[@]}"; do
      [ -f "$STAGE/$p/SKILL.md" ] || missing_pinned="$missing_pinned $p"
    done
    if [ -n "$missing_pinned" ]; then echo "FAIL pinned skill missing SKILL.md:$missing_pinned"; fail=1; else echo "ok   ${#PINNED_SKILL_PATHS[@]} pinned third-party skills"; fi
  fi

  [ "$fail" -eq 0 ] || { echo "artifact verification FAILED"; exit 1; }
fi

echo "--- done ---"
echo "$ZIP"
echo "$MANIFEST"
echo "$(cat "$OUT_DIR/${BASE}.zip.sha256")"
