# shellcheck shell=bash
# Skill-enablement family: `enabled: false` has to reach the runtime, and every
# answer that recommends skills has to say when it withheld one.
#
# C34 — todo answer do kernel que emite `skills` emite tambem `skills_suppressed`.
# C35 — nenhum dominio de routing fica sem skill por desabilitacao silenciosa.
#
# Escritos junto com o enforcement: antes disso, `enabled: false` era lido
# apenas pelo console, e desabilitar uma skill mudava um arquivo e nada mais.

# ------------------------------- C34: contencao do par skills/skills_suppressed
# O filtro vive em tres sitios de resposta (route-path, route-intent,
# resolve-task) porque as tres montam o objeto por conta propria. Um quarto
# sitio adicionado sem o filtro devolveria a lista crua e ninguem notaria — o
# sintoma e uma skill desabilitada aparecendo, nao um erro. Este check afirma o
# par nos tres, comportamentalmente, e nao por leitura do fonte.
check_C34() {
  have_jq || return 0
  [ -x "$KSH" ] || [ -f "$KSH" ] || { bad "kernel ausente: $KSH"; return 0; }

  local dom sample missing=""
  dom=$(jq -r '[.domains[] | select((.skills | length) > 0)][0].id' "$RJSON" 2>/dev/null)
  sample=$(jq -r --arg d "$dom" '.domains[] | select(.id==$d) | .sample_path' "$RJSON" 2>/dev/null)
  if [ -z "$dom" ] || [ "$dom" = null ]; then
    skip_pending skill-enablement "skills/skills_suppressed pair — nenhum dominio de routing declara skill"
    return 0
  fi

  local out
  out=$(bash "$KSH" route-path "$sample" 2>&1)
  printf '%s' "$out" | jq -e 'has("skills") and has("skills_suppressed")' >/dev/null 2>&1 \
    || missing="$missing route-path"

  out=$(bash "$KSH" route-intent "create a new nestjs endpoint" 2>&1)
  printf '%s' "$out" | jq -e '(.matches | length) == 0 or all(.matches[]; has("skills") and has("skills_suppressed"))' >/dev/null 2>&1 \
    || missing="$missing route-intent"

  out=$(bash "$KSH" resolve-task --prompt "create a new nestjs endpoint" 2>&1)
  printf '%s' "$out" | jq -e '.task_contract | has("skills") and has("skills_suppressed")' >/dev/null 2>&1 \
    || missing="$missing resolve-task"

  if [ -n "$missing" ]; then
    bad "answer do kernel emite skills sem skills_suppressed — uma skill desabilitada sumiria sem dizer por que:$missing"
  else
    ok "os tres sitios de resposta do kernel (route-path, route-intent, resolve-task) emitem skills junto com skills_suppressed"
  fi
}

# ------------------- C35: dominio esvaziado por desabilitacao, sem fallback
# Desabilitar uma skill e prerrogativa do operador. Esvaziar um dominio inteiro
# por desabilitacao nao e uma escolha que alguem toma de proposito sem saber: o
# dominio continua roteando, continua carregando regras, e passa a recomendar
# nenhuma skill. E a "dependencia desabilitada sem fallback explicito" que o
# console tem de recusar; aqui ela e detectada na fronteira que ja existe.
check_C35() {
  have_jq || return 0

  local disabled
  disabled=$(bash "$KSH" skill-state 2>/dev/null | jq -r '.disabled[]?' 2>/dev/null)
  if [ -z "$disabled" ]; then
    ok "nenhuma skill desabilitada — nenhum dominio de routing pode ter sido esvaziado por desabilitacao"
    return 0
  fi

  local emptied="" dom skills remaining
  while IFS= read -r dom; do
    [ -n "$dom" ] || continue
    skills=$(jq -r --arg d "$dom" '.domains[] | select(.id==$d) | .skills[]' "$RJSON" 2>/dev/null)
    [ -n "$skills" ] || continue
    remaining=0
    while IFS= read -r s; do
      [ -n "$s" ] || continue
      case "
$disabled
" in *"
$s
"*) ;; *) remaining=$((remaining+1)) ;; esac
    done <<EOF2
$skills
EOF2
    [ "$remaining" -eq 0 ] && emptied="$emptied $dom"
  done < <(jq -r '.domains[] | select((.skills | length) > 0) | .id' "$RJSON" 2>/dev/null)

  if [ -n "$emptied" ]; then
    bad "dominio(s) de routing sem nenhuma skill habilitada — todas desabilitadas e sem fallback declarado:$emptied (desabilitadas: $(printf '%s' "$disabled" | tr '\n' ' '))"
  else
    ok "skills desabilitadas ($(printf '%s' "$disabled" | tr '\n' ' ')) nao esvaziam nenhum dominio de routing"
  fi
}
