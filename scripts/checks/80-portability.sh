# shellcheck shell=bash
# Portability family: the two invariants that, when they break, make every other
# check unreadable rather than merely failing.
#
# C32 — os espelhos de adaptador nao divergem entre si.
# C33 — nenhum arquivo de texto consumido por parser POSIX carrega CRLF.
#
# Ambos foram escritos depois que um checkout Windows reescreveu 509 arquivos
# para CRLF e o diff do repositorio passou a mostrar 512 arquivos alterados sem
# uma unica mudanca semantica. Um repositorio nesse estado nao permite revisar
# nada, entao a regressao precisa ser detectada por check, nao por leitura.

# ------------------------------------------- C32: paridade dos espelhos
# .agents/, .trae/ e .windsurf/ carregam a mesma arvore de skills que a
# ferramenta correspondente le. Nada garantia que continuassem iguais: um edit
# em um espelho e invisivel nos outros ate alguem reclamar de comportamento
# diferente entre ferramentas. Aqui a paridade e afirmada, nao presumida.
check_C32() {
  local base=.agents/skills
  local mirrors=".trae/skills .windsurf/skills"

  if [ ! -d "$base" ]; then
    skip_pending adapter-mirrors "adapter mirror parity — $base ausente (espelhos so entram no pacote com --with-ide-mirrors)"
    return 0
  fi

  # Fonte da verdade: o que esta versionado. Uma skill recem-criada e ainda nao
  # rastreada e decisao de escopo pendente, nao divergencia de espelho — chamar
  # isso de defeito ensina a ignorar o check. O que este check existe para pegar
  # e o commit que edita um espelho e esquece os outros.
  local src=tree
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    src=git
  fi

  local m
  for m in $mirrors; do
    [ -d "$m" ] || { bad "espelho de adaptador ausente: $m (presente: $base)"; return 0; }
  done

  local missing="" diverged="" extra="" n=0 rel
  while IFS= read -r f; do
    rel="${f#"$base"/}"
    n=$((n+1))
    for m in $mirrors; do
      if [ ! -f "$m/$rel" ]; then
        missing="$missing $m/$rel"
      elif ! cmp -s "$f" "$m/$rel"; then
        diverged="$diverged $m/$rel"
      fi
    done
  done < <(if [ "$src" = git ]; then git ls-files -- "$base"; else find "$base" -type f; fi)

  # Direcao inversa: arquivo que existe no espelho e nao na base.
  for m in $mirrors; do
    while IFS= read -r f; do
      rel="${f#"$m"/}"
      [ -f "$base/$rel" ] || extra="$extra $m/$rel"
    done < <(if [ "$src" = git ]; then git ls-files -- "$m"; else find "$m" -type f; fi)
  done

  if [ -n "$missing" ] || [ -n "$diverged" ] || [ -n "$extra" ]; then
    local nm nd ne
    nm=$(printf '%s' "$missing" | wc -w); nd=$(printf '%s' "$diverged" | wc -w); ne=$(printf '%s' "$extra" | wc -w)
    bad "espelhos de adaptador divergiram de $base — ausentes=$nm conteudo-difere=$nd so-no-espelho=$ne; primeiro:$(printf '%s %s %s' "$missing" "$diverged" "$extra" | tr -s ' ' '\n' | grep -v '^$' | head -3 | tr '\n' ' ')"
  else
    ok "espelhos de adaptador identicos byte a byte a $base em .trae e .windsurf ($n arquivos x 2, via $src)"
  fi
}

# ---------------------------------------------- C33: politica de fim de linha
# *.ps1 e a unica excecao declarada em .gitattributes: roda em host Windows e
# nao passa por parser POSIX. Todo o resto tem de estar em LF na arvore, em
# qualquer plataforma — e o que .gitattributes promete e o que os hooks, o
# kernel e os parsers de registry dependem.
check_C33() {
  local offenders="" n=0 f src

  # Dentro de um repositorio, a lista autoritativa e a do git: arquivo gerado
  # ou ignorado (console/next-env.d.ts, caches) nao esta sob esta politica e
  # audita-lo produz FAIL que ninguem pode corrigir. Fora dele — no pacote
  # extraido, onde os checks tambem rodam — vale a arvore inteira, que ja
  # contem so o que a allowlist deixou entrar.
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    src=git
  else
    src=tree
  fi

  while IFS= read -r f; do
    [ -f "$f" ] || continue
    n=$((n+1))
    if LC_ALL=C grep -qU $'\r' "$f" 2>/dev/null; then
      offenders="$offenders $f"
    fi
  done < <(
    if [ "$src" = git ]; then
      git ls-files -- '*.sh' '*.md' '*.json' '*.jsonl' '*.ts' '*.tsx' '*.mjs' '*.cjs' '*.yaml' '*.yml' '*.py' '*.sql'
    else
      find . -type f \
        \( -name '*.sh' -o -name '*.md' -o -name '*.json' -o -name '*.jsonl' \
           -o -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' -o -name '*.cjs' \
           -o -name '*.yaml' -o -name '*.yml' -o -name '*.py' -o -name '*.sql' \) \
        -not -path './node_modules/*' -not -path './*/node_modules/*' \
        -not -path './.git/*' -not -path './console/.next/*' -not -path './build/*' \
        -not -path './.claude/*'
    fi
  )

  if [ -n "$offenders" ]; then
    bad "CRLF em texto lido por parser POSIX — a politica de eol de .gitattributes nao esta valendo ($(printf '%s' "$offenders" | wc -w) arquivos; primeiro:$(printf '%s' "$offenders" | tr -s ' ' '\n' | grep -v '^$' | head -3 | tr '\n' ' '))"
  else
    ok "fim de linha se sustenta: $n arquivos de texto POSIX em LF via $src, *.ps1 excetuado por .gitattributes"
  fi
}
