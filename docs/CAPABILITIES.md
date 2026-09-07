# EngineOS — matriz de capacidades e evidência

**Status:** baseline medida em 07/09/2026 · **Snapshot:** `99b5eec` (working tree limpo, exceto `skills-lock.json`)
**Regra desta tabela (E01):** uma capacidade só aparece como *disponível* se houver implementação **e** evidência que a exercite. Desenho, spec e regra escrita não contam como implementação. Onde a evidência é indireta, isso está dito.

Esta matriz existe porque o PRD (`docs/PRD.md`, Draft v1 de 11/06/2026) descreve a intenção original, não o estado atual. Ela é a fonte para release notes, para o mapa de compatibilidade e para o que pode ser anunciado a um usuário.

## Legenda

| Estado | Significado |
|---|---|
| **Disponível** | Implementado e coberto por verificação automatizada sobre os bytes da release. |
| **Parcial** | Existe implementação, mas uma parte anunciada do comportamento não está conectada ou não está verificada. |
| **Planejado** | Existe desenho, regra ou spec; não existe implementação. Não pode ser anunciado. |

## Matriz

| Capacidade | Estado | Implementação | Evidência | Lacuna / épico |
|---|---|---|---|---|
| Roteamento por intenção e carga de regras/skills | Disponível | `registries/intents.json`, `registries/routing.json`, `agents/router.md`, `hooks/` | `scripts/validate-engineos.sh` — 108 checks, 0 falhas sobre o pacote extraído | — |
| Kernel de decisão determinístico (risco, admission, breaker, HITL) | Parcial | `scripts/kernel.sh` (`risk`, `admit`, `breaker`, `hitl`), `registries/policy.json`, `registries/decision-rules.json` | Checks de kernel e de acoplamento backpressure/HITL passam | As decisões não estão ligadas a transições reais de execução — não há *enforcement* operacional. E04 |
| Gates de qualidade por hook (typecheck/lint/testes) | Disponível | `hooks/hooks.json` + `hooks/*.sh` | Checks de modo de hook e de wiring; `npm test` 24/24 | — |
| Runtime TypeScript (CLI) | Parcial | `src/cli.ts`, `src/dispatch.ts`, `src/io.ts`, `src/node-guard.ts`, `dist/engineos.cjs` | typecheck limpo, 24/24 testes, guarda de drift `dist` vs `src` na CI | É dispatch de CLI, não um runner: não há estados de execução, orçamento, prazo, cancelamento ou aprovação persistida. E04 |
| Console administrativo | Parcial | `console/` — entidades: apenas `skills.ts`; APIs: `skills`, `publish`, `diff`, `history`, `rollback` | typecheck do console | Faltam agentes, modelos, MCPs, routing e regras; sem autenticação/RBAC; efeito real de `enabled=false` não comprovado. E03 |
| Distribuição reproduzível (pacote, manifesto, checksum) | Disponível | `scripts/package-release.sh`, job `package` em `.github/workflows/ci.yml` | Artefato `engineos-1.6.0-99b5eec.zip`: 344 arquivos, validate 108/0, `npm ci` por lockfile, typecheck, 24/24 testes | Matriz de plataforma cobre Linux e Windows/Git Bash na CI; macOS não declarado suportado. E02 |
| Portabilidade de fim de linha e permissões | Disponível | `.gitattributes` (LF para todo texto, CRLF só `*.ps1`), verificação no empacotador | Job `package` falha se o checkout divergir do HEAD; verificação de CRLF e de bit de execução sobre os bytes finais | — |
| Telemetria / exec journal | Parcial | `scripts/exec-journal.sh`, `scripts/telemetry.sh`, `rules/observability.md` | Checks de esquema de span, de wiring bidirecional e de guarda de campos | Sem consumidor: nenhuma exportação OpenTelemetry, dashboard, alerta ou SLO. Sem custo/latência agregados. E05 |
| Evals | Parcial | `evals/intent-routing-cases.jsonl` (33 casos), `evals/agent-cases.jsonl` (16), `scripts/run-evals.sh`, `.github/workflows/live-evals.yml` | Checks determinísticos de integridade dos datasets | Sem execução live medida nesta baseline; sem métricas de seleção de tool, groundedness, vazamento ou custo. E06 |
| Memória e promoção de aprendizado | Planejado | `rules/memory.md`, `docs/specs/2026-09-03-agent-memory-architecture-design.md`, `skills/retro/SKILL.md` | — | `promote-candidates` não existe no código; sem agrupamento, deduplicação, TTL ou revogação. E07 |
| RAG | Planejado | `rules/llm-apps.md`, `skills/eval-harness/references/retrieval-metrics.md` | Check de que as três métricas estão definidas e referenciadas | Orientação escrita, sem corpus, ingestão, índice ou recuperação. E08 |
| Filas, workers, recuperação distribuída | Planejado | — | — | Nada implementado; exigido apenas se o perfil distribuído entrar na release. E09 |
| Registry de tools/MCPs e autorização | Planejado | `templates/mcp.template.json` | — | Configuração manual por template; sem catálogo, health-check, rate limit ou autorização no servidor. E10 |
| Adaptadores de outras ferramentas (Cursor, Trae, Windsurf, `.agents`) | Parcial | `.cursor/`, `.trae/`, `.windsurf/`, `.agents/`, `templates/adapters/` | — | São espelhos versionados sem verificação de sincronismo; ficam fora do pacote por padrão (`--with-ide-mirrors`). E01 |

## Perfis de implantação

| Perfil | Descrição | Gates obrigatórios antes de liberar |
|---|---|---|
| **Local (single-dev)** | Instalação em `~/.claude` pelo `install.sh`/`install.ps1`; console não hospedado | E01, E02; suporte, atualização segura e recuperação da instalação local |
| **Equipe (repo compartilhado)** | Mesmo pacote distribuído a 2–10 pessoas por git | O anterior + E03 (console íntegro, publicação e rollback) e E06 (regressão bloqueante) |
| **Hospedado** | Console servido a mais de um operador | O anterior + autenticação, RBAC, isolamento, auditoria central (E03/E10) e observabilidade com alerta (E05) |
| **Distribuído** | Execução por filas e workers | Todos os anteriores + E09 (idempotência, lease, recuperação, carga) |

Recurso incompleto permanece desabilitado e explicitamente **não suportado** no perfil liberado. Nenhum perfil foi liberado até esta data: SLO, RPO, RTO, retenção e orçamento ainda não têm valores definidos (ver seção 8 do plano de adequação).

## Divergências conhecidas do PRD

O PRD Draft v1 declara como *non-goals* três coisas que o repositório já faz. Isso precisa ser corrigido no PRD, não aqui:

1. "Non-Claude tooling (Cursor rules, Copilot instructions)" — existem `.cursor/`, `.trae/`, `.windsurf/`, `.agents/` e `templates/adapters/` para Codex, Cursor e GitHub Copilot.
2. "Building a custom plugin marketplace" — existe `.claude-plugin/marketplace.json`.
3. "CI/CD agent automation" — existem `.github/workflows/ci.yml` e `live-evals.yml`.

Além disso, as questões em aberto do PRD sobre chave de API em `settings.json` são anteriores a este repositório; a varredura de segredos sobre os bytes da release não encontrou achado, o que não é prova de ausência.
