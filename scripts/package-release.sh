#!/usr/bin/env bash
# package-release.sh — gera o artefato de distribuicao do EngineOS (E02).
#
# Principios (plano EngineOS 2.0, E02):
#   - O pacote vem de um COMMIT, nunca do working tree: `git archive` nao
#     enxerga node_modules, caches, banco do console, .env ou worktree suja.
#   - Allowlist explicita de caminhos: o que nao esta listado nao entra.
#   - LF garantido pelos atributos do repositorio; modo de execucao dos .sh
#     verificado no artefato final.
#   - Manifesto + checksum: todo arquivo publicado e rastreavel ao commit.
#
# Uso:
#   scripts/package-release.sh [--commit <ref>] [--out <dir>] [--with-ide-mirrors] [--no-verify]
#
# Saida em <out>/:
#   engineos-<versao>-<shortsha>.zip
#   engineos-<versao>-<shortsha>.zip.sha256
#   engineos-<versao>-<shortsha>.MANIFEST.txt

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
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# --- Allowlist -------------------------------------------------------------
# Superficie de runtime + documentacao da release. Fora da lista, por decisao
# explicita: .engineos (historico de desenvolvimento), .github (CI), node_modules
# e build/ (reinstalaveis), dados locais do console.
PATHS=(
  # Ativos de runtime que vivem sob .engineos/. O historico de mudancas
  # (.engineos/archived, .engineos/changes/2026-*) e desenvolvimento e fica
  # de fora; o template e os READMEs sao lidos pelos checks e pelas skills.
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
if [ "$WITH_IDE_MIRRORS" -eq 1 ]; then
  PATHS+=(.agents .cursor .trae .windsurf)
fi

# --- Identidade do artefato ------------------------------------------------
SHA="$(git rev-parse "$COMMIT")"
SHORT="$(git rev-parse --short "$COMMIT")"
VERSION="$(git show "$COMMIT:package.json" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -n "$VERSION" ] || { echo "erro: nao foi possivel ler a versao de package.json em $COMMIT" >&2; exit 1; }

# Manifests do plugin devem concordar com package.json (E01).
PLUGIN_VERSION="$(git show "$COMMIT:.claude-plugin/plugin.json" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
if [ "$PLUGIN_VERSION" != "$VERSION" ]; then
  echo "erro: versao divergente — package.json=$VERSION plugin.json=$PLUGIN_VERSION" >&2
  exit 1
fi

BASE="engineos-${VERSION}-${SHORT}"
mkdir -p "$OUT_DIR"
ZIP="${OUT_DIR}/${BASE}.zip"
MANIFEST="${OUT_DIR}/${BASE}.MANIFEST.txt"

echo "commit .......... $SHA"
echo "versao .......... $VERSION"
echo "artefato ........ $ZIP"

# --- Empacotamento ---------------------------------------------------------
rm -f "$ZIP" "$ZIP.sha256" "$MANIFEST"
git archive --format=zip -9 --prefix="engineos-${VERSION}/" -o "$ZIP" "$COMMIT" -- "${PATHS[@]}"

# --- Manifesto -------------------------------------------------------------
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
git archive --format=tar "$COMMIT" -- "${PATHS[@]}" | tar -x -C "$STAGE"

{
  echo "# EngineOS release manifest"
  echo "# version:  $VERSION"
  echo "# commit:   $SHA"
  echo "# gerado:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# arquivos: $(find "$STAGE" -type f | wc -l | tr -d ' ')"
  echo "#"
  echo "# sha256  caminho"
  ( cd "$STAGE" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | while IFS= read -r f; do
      printf '%s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$f"
    done )
} > "$MANIFEST"

( cd "$OUT_DIR" && sha256sum "${BASE}.zip" > "${BASE}.zip.sha256" )

# --- Verificacoes do artefato ---------------------------------------------
if [ "$VERIFY" -eq 1 ]; then
  echo "--- verificacao ---"
  fail=0

  # Bibliotecas carregadas com `source`: nao sao invocadas diretamente e por
  # isso nao devem ter bit de execucao. Qualquer outro *.sh deve ter.
  is_sourced_lib() {
    case "$1" in
      ./hooks/lib-*.sh|./hooks/layout-manifest.sh|./hooks/scaffold-layout.sh|./scripts/checks/*.sh) return 0 ;;
      *) return 1 ;;
    esac
  }

  # 1. Nenhum CRLF em arquivo consumido por parser POSIX.
  crlf="$( cd "$STAGE" && find . -type f \( -name '*.sh' -o -name '*.md' -o -name '*.json' -o -name '*.jsonl' -o -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.yaml' -o -name '*.yml' -o -name '*.py' \) -exec grep -lU $'\r' {} + 2>/dev/null || true )"
  if [ -n "$crlf" ]; then echo "FALHA CRLF em: $(echo "$crlf" | head -5)"; fail=1; else echo "ok   sem CRLF nos formatos POSIX"; fi

  # 2. Scripts executaveis tem bit de execucao; bibliotecas sourced nao.
  noexec=""
  wrongexec=""
  while IFS= read -r f; do
    if is_sourced_lib "$f"; then
      [ -x "$STAGE/$f" ] && wrongexec="$wrongexec $f"
    else
      [ -x "$STAGE/$f" ] || noexec="$noexec $f"
    fi
  done <<EOF
$( cd "$STAGE" && find . -name '*.sh' -type f | LC_ALL=C sort )
EOF
  if [ -n "$noexec" ]; then echo "FALHA sem bit de execucao:$noexec"; fail=1; else echo "ok   scripts executaveis"; fi
  if [ -n "$wrongexec" ]; then echo "FALHA biblioteca sourced marcada executavel:$wrongexec"; fail=1; else echo "ok   bibliotecas sourced sem bit de execucao"; fi

  # 3. Nada reinstalavel, de cache ou de estado local entrou.
  junk="$( cd "$STAGE" && find . \( -name node_modules -o -name '.next' -o -name build -o -name '*.db' -o -name '*.sqlite*' -o -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' \) 2>/dev/null || true )"
  if [ -n "$junk" ]; then echo "FALHA conteudo nao previsto: $(echo "$junk" | head -5)"; fail=1; else echo "ok   sem deps, caches ou estado local"; fi

  # 4. Varredura de segredos. Um achado exige triagem manual; ausencia de
  #    achado nao e prova de ausencia de segredo.
  secrets="$( cd "$STAGE" && grep -rIlE '(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,})' . 2>/dev/null || true )"
  if [ -n "$secrets" ]; then echo "ATENCAO possivel segredo em: $(echo "$secrets" | head -5)  (triagem manual obrigatoria)"; fail=1; else echo "ok   varredura de segredos sem achado"; fi

  # 5. Lockfiles presentes: instalacao reproduzivel.
  for lf in package-lock.json console/package-lock.json; do
    if [ -f "$STAGE/$lf" ]; then echo "ok   lockfile $lf"; else echo "FALHA lockfile ausente: $lf"; fail=1; fi
  done

  # 6. Entrypoints do instalador presentes.
  for f in install.sh install.ps1 .claude-plugin/plugin.json hooks/hooks.json; do
    if [ -f "$STAGE/$f" ]; then echo "ok   $f"; else echo "FALHA ausente: $f"; fail=1; fi
  done

  [ "$fail" -eq 0 ] || { echo "verificacao do artefato FALHOU"; exit 1; }
fi

echo "--- pronto ---"
echo "$ZIP"
echo "$MANIFEST"
echo "$(cat "$OUT_DIR/${BASE}.zip.sha256")"
