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
| Kernel de decisão determinístico (risco, admission, breaker, HITL) | Parcial | `scripts/kernel.sh` (`risk`, `admit`, `breaker`, `hitl`, `skill-state`), `registries/policy.json`, `registries/decision-rules.json` | 348 casos em `test-kernel.sh`; checks de kernel e de acoplamento backpressure/HITL | Risco, admission e breaker continuam sem ligação com transições reais de execução. Só `enabled=false` ganhou ponto de aplicação. E04 |
| Gates de qualidade por hook (typecheck/lint/testes) | Disponível | `hooks/hooks.json` + `hooks/*.sh` | Checks de modo de hook e de wiring; `npm test` 24/24 | — |
| Runtime TypeScript (CLI) | Parcial | `src/cli.ts`, `src/dispatch.ts`, `src/io.ts`, `src/node-guard.ts`, `dist/engineos.cjs` | typecheck limpo, 24/24 testes, guarda de drift `dist` vs `src` na CI | É dispatch de CLI, não um runner: não há estados de execução, orçamento, prazo, cancelamento ou aprovação persistida. E04 |
| Console administrativo | Parcial | `console/` — entidades: `skills.ts` + `relations.ts`; guardas: `publish-lock.ts` + `detectBaseConflicts`; APIs: `skills`, `publish`, `diff`, `history`, `rollback` | 12 testes de comportamento das guardas (`npm test`); typecheck e lint; job `console` na CI; relações reais resolvidas contra `agents/`, `rules/` e as registries | Faltam agentes, modelos, MCPs, routing e regras como entidades editáveis; sem precedência declarada; sem autenticação/RBAC. E03 |
| Distribuição reproduzível (pacote, manifesto, checksum) | Disponível | `scripts/package-release.sh`, job `package` em `.github/workflows/ci.yml` | Artefato `engineos-1.6.0-99b5eec.zip`: 344 arquivos, validate 108/0, `npm ci` por lockfile, typecheck, 24/24 testes | Matriz de plataforma cobre Linux e Windows/Git Bash na CI; macOS não declarado suportado. E02 |
| Portabilidade de fim de linha e permissões | Disponível | `.gitattributes` (LF para todo texto, CRLF só `*.ps1`), verificação no empacotador, checks `C32`/`C33` | Job `package` falha se o checkout divergir do HEAD; `C33` audita 571 arquivos de texto POSIX; verificação de CRLF e de bit de execução sobre os bytes finais | Matriz de plataformas em `docs/COMPATIBILITY.md`; macOS fora |
| Telemetria / exec journal | Parcial | `scripts/exec-journal.sh`, `scripts/telemetry.sh`, `rules/observability.md` | Checks de esquema de span, de wiring bidirecional e de guarda de campos | Sem consumidor: nenhuma exportação OpenTelemetry, dashboard, alerta ou SLO. Sem custo/latência agregados. E05 |
| Evals | Parcial | `evals/intent-routing-cases.jsonl` (33 casos), `evals/agent-cases.jsonl` (16), `scripts/run-evals.sh`, `.github/workflows/live-evals.yml` | Checks determinísticos de integridade dos datasets | Sem execução live medida nesta baseline; sem métricas de seleção de tool, groundedness, vazamento ou custo. E06 |
| Memória e promoção de aprendizado | Planejado | `rules/memory.md`, `docs/specs/2026-09-03-agent-memory-architecture-design.md`, `skills/retro/SKILL.md` | — | `promote-candidates` não existe no código; sem agrupamento, deduplicação, TTL ou revogação. E07 |
| RAG | Planejado | `rules/llm-apps.md`, `skills/eval-harness/references/retrieval-metrics.md` | Check de que as três métricas estão definidas e referenciadas | Orientação escrita, sem corpus, ingestão, índice ou recuperação. E08 |
| Filas, workers, recuperação distribuída | Planejado | — | — | Nada implementado; exigido apenas se o perfil distribuído entrar na release. E09 |
| Registry de tools/MCPs e autorização | Planejado | `templates/mcp.template.json` | — | Configuração manual por template; sem catálogo, health-check, rate limit ou autorização no servidor. E10 |
| Adaptadores de outras ferramentas (Cursor, Trae, Windsurf, `.agents`) | Parcial | `.cursor/`, `.trae/`, `.windsurf/`, `.agents/`, `templates/adapters/` | Check `C32` — os três espelhos são byte a byte idênticos (47 arquivos × 2); matriz de enforcement honesta em `templates/adapters/README.md` | Fora do Claude Code, os gates de Stop degradam para convenção — está documentado, não resolvido. CI é a única camada portátil. Ficam fora do pacote por padrão (`--with-ide-mirrors`). E01 |

### Publicação — o que já não pode acontecer

O console edita uma **cópia**. Entre o momento em que um draft capturou um arquivo e o clique em Publicar, esse arquivo pode ser editado à mão, por outra sessão do console ou por uma operação de git. Publicar então descartava esse trabalho em silêncio — sem erro, sem diff, sem rastro. Desde 07/09/2026:

| Situação | Antes | Agora |
|---|---|---|
| Arquivo mudou no disco desde a captura do draft | Sobrescrevia sem avisar | Publicação recusada, nomeando os arquivos |
| Draft sem revisão base registrada | Não existia o conceito | Recusado como base desconhecida (fail-closed) |
| Duas publicações concorrentes | Interleaving de `git add`/`commit` | Serializadas por lock de diretório, entre processos |
| Rollback sobre arquivo com alteração não commitada | `git revert` abortava ou parava em conflito | Recusado antes de tocar em qualquer coisa |

O lock é `mkdir`, não uma flag em memória: uma flag não excluiria uma **segunda instância** do console apontada para o mesmo repositório, que é exatamente o caso de publicação concorrente.

### Habilitação de skill — o que o interruptor vale

`enabled: false` deixou de ser decorativo em 07/09/2026. O kernel para de recomendar a skill e diz que a suprimiu; o que ele **não** faz é impedir alguém de invocá-la pelo nome, porque a ferramenta Skill lê o diretório e não há hook entre as duas coisas. Bloqueio real exige desinstalar a skill. O contrato completo, com onde é testado, está em [`COMPATIBILITY.md`](COMPATIBILITY.md#what-enabled-false-does-and-does-not-do).

Isso é enforcement de **recomendação**, não de execução — e é o limite que separa esta linha de um "disponível" para E03 como um todo.

## Perfis de implantação

| Perfil | Descrição | Gates obrigatórios antes de liberar |
|---|---|---|
| **Local (single-dev)** | Instalação em `~/.claude` pelo `install.sh`/`install.ps1`; console não hospedado | E01, E02; suporte, atualização segura e recuperação da instalação local |
| **Equipe (repo compartilhado)** | Mesmo pacote distribuído a 2–10 pessoas por git | O anterior + E03 (console íntegro, publicação e rollback) e E06 (regressão bloqueante) |
| **Hospedado** | Console servido a mais de um operador | O anterior + autenticação, RBAC, isolamento, auditoria central (E03/E10) e observabilidade com alerta (E05) |
| **Distribuído** | Execução por filas e workers | Todos os anteriores + E09 (idempotência, lease, recuperação, carga) |

Recurso incompleto permanece desabilitado e explicitamente **não suportado** no perfil liberado. Nenhum perfil foi liberado até esta data: SLO, RPO, RTO, retenção e orçamento ainda não têm valores definidos (ver seção 8 do plano de adequação).

## Decisões registradas

As decisões que sustentam esta matriz estão em ADR, cada uma com a alternativa rejeitada — decisão sem alternativa rejeitada é preferência, não decisão:

| ADR | Status | O que fixa |
|---|---|---|
| [`2026-09-07-release-from-commit-with-allowlist`](adr/2026-09-07-release-from-commit-with-allowlist.md) | accepted | O artefato é função de um commit, por allowlist; o teste roda sobre os bytes finais |
| [`2026-09-07-versioned-config-contract`](adr/2026-09-07-versioned-config-contract.md) | proposed | `config_version` imutável fixada por execução; publicação condicional à revisão base |
| [`2026-09-07-approval-bound-to-effect`](adr/2026-09-07-approval-bound-to-effect.md) | proposed | Aprovação vale para (ação, argumentos, destino, `config_version`) — nunca por sessão |
| [`2026-09-07-when-to-split-a-service`](adr/2026-09-07-when-to-split-a-service.md) | proposed | Cinco gatilhos observáveis para extrair um serviço; nenhum disparou até hoje |
| [`2026-09-04-typescript-runtime-over-bash`](adr/2026-09-04-typescript-runtime-over-bash.md) | accepted | Linguagem do núcleo (fronteira método/runtime) |
| [`2026-09-03-hitl-as-kernel-entity`](adr/2026-09-03-hitl-as-kernel-entity.md) | accepted | HITL como entidade consultável, com vocabulário fechado de razões |

As três ADRs em `proposed` descrevem contratos de E03/E04/E09 ainda não implementados. Enquanto estiverem nesse estado, o comportamento correspondente **não** pode ser anunciado.

## Divergências conhecidas do PRD

O PRD Draft v1 declara como *non-goals* três coisas que o repositório já faz. Isso precisa ser corrigido no PRD, não aqui:

1. "Non-Claude tooling (Cursor rules, Copilot instructions)" — existem `.cursor/`, `.trae/`, `.windsurf/`, `.agents/` e `templates/adapters/` para Codex, Cursor e GitHub Copilot.
2. "Building a custom plugin marketplace" — existe `.claude-plugin/marketplace.json`.
3. "CI/CD agent automation" — existem `.github/workflows/ci.yml` e `live-evals.yml`.

Além disso, as questões em aberto do PRD sobre chave de API em `settings.json` são anteriores a este repositório; a varredura de segredos sobre os bytes da release não encontrou achado, o que não é prova de ausência.
