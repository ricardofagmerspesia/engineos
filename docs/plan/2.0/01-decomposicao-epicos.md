# EngineOS 2.0 — Decomposição dos épicos em tarefas

Data: 06/09/2026 · Fonte: `EngineOS 2.0 — Plano de adequação para produção` (rev. 2)
Estado: decomposição para execução. Nenhuma tarefa aqui foi executada.

## Como ler

Cada tarefa tem ID `E0X-Tn`, escopo em arquivos reais deste repositório, dependências,
tier de risco e teto de autonomia segundo `rules/risk-autonomy.md` / `registries/policy.json`,
o gate da escada `discovery → design → implementation → validation → release`
(`policy.json` `gates.ladder`) que ela precisa cruzar, um aceite verificável e a evidência
que fecha a tarefa.

Convenções aplicadas:

- **Aceite verificável** é uma pós-condição observável, não uma descrição de esforço.
- **Evidência** é o artefato que um terceiro consegue reexecutar ou auditar.
- Tarefa que toca >2 arquivos ou cria capacidade nova exige spec antes do código
  (não-negociável #1 do `CLAUDE.md`, `gates.spec_threshold`).
- Risco `high` obriga gate de validação com `critic` e release com aprovação humana
  (`policy.json` `gates.by_risk.high`).
- Tarefa que muda superfície pública segue `docs/COMPATIBILITY.md`: depreciação com
  janela, nunca renomeação silenciosa.

Estado atual verificado no working tree em 06/09/2026 (commit `fed9a63`):
`package.json` e `.claude-plugin/plugin.json` em `1.6.0`; `registries/policy.json` em `1.6.0`;
`docs/PRD.md` em `Draft v1` datado de 2026-06-11; `console/src` com a vertical de skills
apenas (`entities/skills.ts`, `validate/skills.ts`, rotas `skills`, `publish`, `history`,
`rollback`, `diff`); `console/.data/console.sqlite` versionado no working tree;
`scripts/kernel.sh` expondo 14 subcomandos; `src/` com `cli.ts`, `dispatch.ts`, `io.ts`,
`node-guard.ts`; `evals/` com dois datasets e `RUBRIC.md`.

---

## E01 — Baseline, escopo e release

Responsável: Tech Lead + responsável pelo produto · Dependência: nenhuma · Fase: F0
Natureza: consolidação. Bloqueia todo o resto — nenhuma outra tarefa deveria começar
sem o snapshot canônico fixado.

| ID | Tarefa | Escopo | Dep | Risco | Aut. | Gate | Aceite verificável | Evidência |
|---|---|---|---|---|---|---|---|---|
| E01-T1 | Fixar snapshot canônico | `git`, working tree | — | low | A3 | implementation | Diferença entre working tree e `HEAD` classificada em: semântica, fim de linha, modo de arquivo. Nenhuma diferença semântica não explicada | Relatório com commit, hash do artefato, `git diff --stat` normalizado por `-w --ignore-cr-at-eol` |
| E01-T2 | Inventariar o que saiu no pacote anterior | artefato ZIP, `.gitignore` | E01-T1 | medium | A2 | implementation | Lista de itens presentes no ZIP e ausentes do `HEAD`, com decisão explícita (incluir/excluir) para cada classe | Inventário versionado; `console/.data/`, `console/.next/`, `node_modules/` marcados para exclusão |
| E01-T3 | Definir perfis de implantação | `docs/PRD.md`, novo `docs/DEPLOYMENT-PROFILES.md` | E01-T1 | medium | A2 | design | Existem perfis nomeados (local single-user, local time, hospedado) com população, carga, criticidade e conjunto de gates obrigatórios por perfil | Documento aprovado pelo responsável de produto |
| E01-T4 | Matriz de capacidades por perfil | novo `docs/CAPABILITIES.md` | E01-T3 | medium | A2 | design | Cada capacidade anunciada tem estado (implementada / parcial / planejada), ponto de implementação, evidência e perfil em que é suportada. Nenhuma capacidade apenas desenhada aparece como disponível | Matriz com link para arquivo e teste de cada linha |
| E01-T5 | Atualizar PRD para o escopo 2.0 | `docs/PRD.md` | E01-T4 | medium | A2 | design | PRD separa capacidades disponíveis, integrações parciais e extensões planejadas; status deixa de ser `Draft v1` | PRD revisado com data e responsável |
| E01-T6 | Sincronizar versão de produto | `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `registries/policy.json`, `docs/release-notes/` | E01-T5 | medium | A2 | implementation | Versão do pacote, dos manifests e das release notes concordam. Versões de schema evoluem em campo próprio e não são renumeradas por arrasto | `scripts/validate-engineos.sh` verde + release notes da versão |
| E01-T7 | Mapa de compatibilidade da release | `docs/COMPATIBILITY.md`, `docs/release-notes/` | E01-T6 | high | A1 | design | Toda superfície pública alterada aparece como depreciação com janela e substituto; nenhuma remoção na mesma release que deprecia | Diff da superfície pública + tabela de depreciações |
| E01-T8 | Matriz por adapter | `.cursor/`, `.trae/`, `.windsurf/`, `.agents/`, `AGENTS.md` | E01-T4 | medium | A2 | design | Cada adapter classificado como bloqueante, checado em CI, consultivo ou convencional, com capacidade real do produto revalidada na data | Matriz datada com fonte da revalidação |
| E01-T9 | ADR — fronteira método/runtime | `docs/adr/` | E01-T3 | medium | A2 | design | Decisão registrada sobre o que é regra em prosa, o que é kernel determinístico e o que é runtime. Estende `2026-09-04-typescript-runtime-over-bash.md` | ADR aceita |
| E01-T10 | ADR — contrato de configuração versionada | `docs/adr/`, `registries/` | E01-T9 | high | A1 | design | `config_version` definido: o que compõe, como é calculado, como um run o fixa e como se compara ao hash da base | ADR aceita + schema de exemplo |
| E01-T11 | ADR — política de aprovação para efeito externo | `docs/adr/`, `registries/policy.json` (`hitl`) | E01-T9 | high | A1 | design | Estende `2026-09-03-hitl-as-kernel-entity.md`: aprovação vinculada a ação, argumentos, destino e versão; regras de invalidação explícitas | ADR aceita |
| E01-T12 | ADR — critérios para separar serviços | `docs/adr/` | E01-T9 | medium | A2 | design | Critérios objetivos (concorrência, isolamento, implantação independente) que autorizam extrair processo ou serviço | ADR aceita |
| E01-T13 | Rastreabilidade política → aplicação → teste | novo `docs/TRACEABILITY.md` | E01-T4 | medium | A2 | validation | Toda regra de `registries/policy.json` e `registries/decision-rules.json` aponta para o ponto de aplicação no código e para o teste que a cobre. Regra sem ponto de aplicação é marcada como não aplicada | Tabela gerada e conferida em CI |

### Achado medido em 06/09/2026 — adianta parte de E01-T1 e E02-T3

Medição executada neste working tree (checkout Windows) contra `git archive HEAD`
normalizado, com os comandos abaixo. Não é conclusão do plano: é dado de entrada para
E01-T1, e reduz o escopo da tarefa.

| Medição | Comando | Resultado |
|---|---|---|
| Diferenças brutas vs `HEAD` | `git diff --numstat HEAD` | **512 arquivos** |
| Diferenças ignorando CR e espaço | `git diff -w --ignore-cr-at-eol --numstat HEAD` | **0 arquivos** |
| Integridade no working tree | `bash scripts/validate-engineos.sh` | **90 ok / 18 FAIL** |
| Integridade em cópia de `git archive HEAD` | idem, em `/tmp` | **108 ok / 0 FAIL** |

Leitura:

1. **Não há divergência semântica** entre o working tree e `HEAD`. Os 512 arquivos diferem
   exclusivamente por fim de linha. E01-T1 já tem sua resposta e vira tarefa de registro,
   não de investigação.
2. **A causa das 18 falhas é CRLF em arquivos que `.gitattributes` não cobre.**
   `.gitattributes` declara `eol=lf` apenas para `*.sh` e `dist/engineos.cjs`; verificação
   direta confirma `hooks/lib-common.sh` e `scripts/kernel.sh` em LF e
   `rules/observability.md`, `rules/risk-autonomy.md`, `rules/llm-apps.md` em CRLF. As
   falhas de espelho de prosa (`observability.md-has-no-Agent-traces-section`,
   `risk-autonomy.md-has-no-Human-in-the-loop-section`, `llm-apps.md-has-no-RAG-section`)
   são o CR quebrando o casamento de seção, não regra ausente. Isso **confirma E02-T3** e
   fixa seu escopo: estender `eol=lf` a `*.md`, `*.json`, `*.jsonl` e `*.mjs`.
3. **A falha de modo de arquivo não é conclusiva por este caminho.** As linhas
   `library-carries-the-executable-bit` foram observadas através de um mount que expõe todo
   arquivo como `-rwx`. Isso é artefato do mount, não evidência sobre o checkout real.
   E02-T4 continua exigindo verificação na plataforma de destino — registrar esta medição
   como prova de defeito de modo seria exatamente o erro que o plano proíbe.

Consequência para o sequenciamento: E02-T3 sobe de prioridade dentro de F0.4, porque hoje
qualquer corrida de `validate-engineos.sh` em máquina Windows produz 18 falhas que não
existem no código — ruído que treina a equipe a ignorar o próprio gate de integridade.

**Aceite do épico:** cada capacidade anunciada aponta para implementação e evidência;
nenhuma funcionalidade apenas desenhada aparece como concluída; versão do produto e
documentação da release concordam.

---

## E02 — Distribuição reproduzível e portabilidade

Responsável: DevOps · Dependência: E01 · Fase: F0 · Natureza: consolidação + correção

| ID | Tarefa | Escopo | Dep | Risco | Aut. | Gate | Aceite verificável | Evidência |
|---|---|---|---|---|---|---|---|---|
| E02-T1 | Empacotador por allowlist | novo `scripts/package.sh`, `.github/workflows/ci.yml` | E01-T1, E01-T2 | medium | A2 | implementation | Pacote gerado a partir de `git archive <commit>` com allowlist explícita. Item fora da allowlist não entra, mesmo presente no working tree | Manifesto do pacote comparado com a allowlist em CI |
| E02-T2 | Denylist de estado local | allowlist em `scripts/package.sh` | E02-T1 | high | A1 | implementation | `console/.data/`, `console/.next/`, `node_modules/`, `.engineos/` e caches ausentes do artefato. Caminho não classificado é **erro duro**, não inclusão silenciosa | `unzip -l` do artefato final sem essas entradas + teste com arquivo plantado |
| E02-T3 | Normalizar fim de linha por formato consumido | `.gitattributes` | E02-T1 | medium | A2 | implementation | Todo formato lido por parser (`*.sh`, `*.json`, `*.jsonl`, `*.mjs`, `*.md` de regra) tem `eol=lf` declarado. Checkout com `core.autocrlf=true` não altera bytes desses arquivos | Teste de checkout em Windows comparando hashes |
| E02-T4 | Preservar modo de execução | `install.sh`, `install.ps1`, novo bootstrap | E02-T3 | medium | A2 | implementation | Após extração, scripts executáveis rodam sem `chmod` manual. Onde o ZIP não preserva modo, o bootstrap documentado o restaura e é testado | Teste em Linux e Windows/Git Bash a partir do artefato |
| E02-T5 | Manifesto e checksum | `scripts/package.sh` | E02-T1 | medium | A2 | implementation | Artefato acompanha manifesto (arquivo, tamanho, hash) e checksum SHA-256 do pacote, ambos rastreáveis ao commit | Manifesto + checksum publicados com a release |
| E02-T6 | Varredura de segredos e dependências | `.github/workflows/ci.yml` | E02-T1 | high | A1 | validation | Varredura roda sobre os bytes finais do artefato e sobre o lockfile. Achado confirmado bloqueia a release e é documentado na correção | Relatório da varredura anexado à release |
| E02-T7 | Matriz de plataformas | `.github/workflows/ci.yml`, `docs/COMPATIBILITY.md` | E02-T4 | medium | A2 | validation | Linux e Windows/Git Bash cobertos; macOS coberto se declarado suportado. Plataforma não testada é declarada não suportada | Job por plataforma com log preservado |
| E02-T8 | Teste E2E do artefato | novo `scripts/test-package.sh` | E02-T4, E02-T5 | high | A1 | validation | Sequência extração → instalação em ambiente limpo → rerun idempotente → tarefa smoke → remoção → recuperação passa sem ajuste manual não documentado | Log completo da sequência em CI, sobre os bytes da release |
| E02-T9 | Sincronismo fonte ↔ bundle **no artefato** | `scripts/test-package.sh` | E02-T1 | low | A3 | validation | O guard de drift do `dist` já existe em `ci.yml` e roda sobre o checkout. Falta afirmá-lo sobre os bytes do artefato | Passo 2 do `scripts/test-package.sh` conferindo hash do bundle contra o manifesto |
| E02-T10 | Regressão de CRLF e permissões | `scripts/test-package.sh` | E02-T3, E02-T4 | medium | A2 | validation | Regressão automatizada detecta reintrodução de CRLF ou perda de bit de execução no pacote final | Teste que falha ao reintroduzir o defeito propositalmente |

**Correções verificadas em 06/09/2026, antes de executar E02:**

- `console/.data/` e `console/.next/` **nunca estiveram rastreados** — `console/.gitignore`
  já os ignora e `git ls-files console/.data` retorna vazio. A contaminação do pacote veio de
  empacotar o working tree, não do git. A correção é empacotar a partir de `git archive`,
  e E02-T2 muda de "deixar de rastrear" para "denylist com erro duro".
- O guard de drift de `dist/engineos.cjs` **já existe** em `.github/workflows/ci.yml`.
  E02-T9 encolhe para afirmá-lo sobre o artefato.
- `.github/workflows/ci.yml` roda **27 passos, só em `ubuntu-latest`, e sempre sobre o
  checkout** — nenhum passo extrai um pacote nem instala a partir dele. Confirma E02-T7 e
  E02-T8 como lacunas reais, não como reforço de algo existente.
- `install.sh` linhas 30-33: a varredura de segredos usa arquivos rastreados quando está em
  um work tree e cai para `grep -rIlE` recursivo quando não está. **Um ZIP extraído não é
  work tree**, então todo consumidor real percorre o ramo de fallback — o único que nenhum
  teste exercita. Acrescentado ao escopo de E02-T6.

Detalhamento em `docs/specs/2026-09-06-f0-baseline-and-distribution-design.md`.

**Aceite do épico:** o artefato publicado instala sem ajustes manuais não documentados;
contém somente itens previstos no manifesto; os testes usam os bytes finais da release.

---

## E03 — Console administrativo completo e seguro

Responsável: Frontend + Backend, com revisão de segurança · Dependências: E01; E10 para
metadados de tools/MCPs · Fase: F1 · Natureza: consolidação

Estado atual: apenas a vertical de skills existe (`console/src/lib/entities/skills.ts`,
`console/src/lib/validate/skills.ts`). O schema em `console/src/lib/store/schema.ts` já é
genérico por `kind` — adicionar entidade não deve exigir migração de schema.

| ID | Tarefa | Escopo | Dep | Risco | Aut. | Gate | Aceite verificável | Evidência |
|---|---|---|---|---|---|---|---|---|
| E03-T1 | Entidade `agent` | `console/src/lib/entities/agents.ts`, `registries/agents.json` | E01-T4 | medium | A2 | implementation | Agentes são listados, editados, validados e publicados a partir do registry real; nenhuma lista vazia fixa | Teste de leitura → edição → publicação → releitura |
| E03-T2 | Entidade `model` | `console/src/lib/entities/models.ts`, `registries/models.json` | E01-T4 | medium | A2 | implementation | Modelos e tiers editáveis; binding validado contra capacidades declaradas | Teste equivalente a E03-T1 |
| E03-T3 | Entidade `mcp`/`tool` | `console/src/lib/entities/tools.ts`, registry de E10 | E10-T1 | high | A1 | implementation | Catálogo de tools/MCPs lido do registry operacional, com risco e projetos permitidos visíveis | Teste de leitura + negativa de ativação sem validação |
| E03-T4 | Entidade `routing` | `console/src/lib/entities/routing.ts`, `registries/routing.json` | E01-T4 | high | A1 | implementation | Rotas editáveis com validação de glob e de precedência; edição inválida é rejeitada antes de publicar | Teste de rota inválida rejeitada |
| E03-T5 | Entidade `rule` | `console/src/lib/entities/rules.ts`, `rules/*.md`, `registries/decision-rules.json` | E01-T13 | high | A1 | implementation | Regras editáveis com verificação do fechamento de carga descrito no `CLAUDE.md` (linha que carrega A e A difere para B obriga carregar B) | Teste que reprova uma linha de carga não fechada |
| E03-T6 | Grafo de relações real | `console/src/lib/entities/graph.ts` | E03-T1..T5 | medium | A2 | implementation | Relações skill ↔ agente ↔ modelo ↔ rota ↔ tool carregadas do estado real; referência órfã é sinalizada | Teste com referência quebrada plantada |
| E03-T7 | Habilitar/desabilitar e binding | entidades + `console/src/app/api/publish/route.ts` | E03-T6 | high | A1 | implementation | `enabled=false` grava e persiste; binding de modelo pode ser feito por ação, rota, agente e skill | Teste de persistência do campo |
| E03-T8 | Precedência e conflito | `console/src/lib/entities/resolve.ts`, `registries/decision-rules.json` (`precedence`, `conflict_policy`) | E03-T7 | high | A1 | design | Precedência ação → rota → agente → skill → padrão global implementada. Conflito no mesmo nível exige resolução explícita e não é decidido por ordem de arquivo | Teste de empate no mesmo nível bloqueando a publicação |
| E03-T9 | Configuração efetiva com proveniência | `console/src/app/` (nova página) | E03-T8 | medium | A2 | implementation | Para cada escolha efetiva, a interface mostra o valor e a origem (qual nível a decidiu) | Captura + teste de proveniência |
| E03-T10 | Simulação de rota antes de publicar | integração com `scripts/kernel.sh resolve-task` | E03-T8 | medium | A2 | implementation | Operador simula uma tarefa contra o draft e vê rota, risco, autonomia, gates e agentes antes de publicar | Teste comparando simulação e execução real |
| E03-T11 | Validação global do draft | `console/src/lib/validate/` | E03-T6 | high | A1 | validation | Referência inválida e dependência desabilitada sem fallback explícito impedem a publicação | Teste negativo por classe de invalidez |
| E03-T12 | Publicação transacional | `console/src/app/api/publish/route.ts`, `console/src/lib/fs-writer.ts`, `console/src/lib/git.ts` | E03-T11 | high | A1 | validation | Publicação compara revisão/hash da base; arquivo já modificado fora do console não é sobrescrito; falha entre escrita de arquivos, commit e snapshot deixa operação recuperável e registrada | Teste de falha injetada em cada etapa |
| E03-T13 | Serialização de publicações concorrentes | `console/src/lib/store/` | E03-T12 | high | A1 | validation | Duas publicações simultâneas não intercalam efeitos; a segunda observa a revisão nova ou é rejeitada | Teste concorrente determinístico |
| E03-T14 | Rollback não destrutivo | `console/src/app/api/rollback/[historyId]/route.ts` | E03-T12 | high | A1 | validation | Rollback restaura versão íntegra e não descarta silenciosamente alteração posterior do operador; conflito é apresentado | Teste de rollback com alteração intermediária |
| E03-T15 | Efeito comprovado de `enabled=false` | runner de E04 + adapters de E10 | E03-T7, E04-T2 | high | A1 | validation | Entidade desabilitada no console não é utilizada pelo runtime. Onde a ferramenta não aplicar o campo, a limitação é exibida e existe mecanismo compatível | Teste ponta a ponta: desabilitar → executar → verificar não uso |
| E03-T16 | Hardening do perfil local | `console/src/lib/config.ts`, middleware | E03-T12 | high | A1 | validation | Interface e host restritos; requisição de origem não autorizada rejeitada; path e argumentos validados na fronteira | Testes negativos de origem e de path traversal |
| E03-T17 | Perfil hospedado: authn, RBAC, isolamento | novo módulo de autorização | E03-T16, E10-T3 | high | A0 | release | Sem autenticação, RBAC e isolamento entre projetos o perfil hospedado permanece desabilitado e declarado não suportado | Testes de autorização negativa + decisão de liberação registrada |
| E03-T18 | Console na CI | `.github/workflows/ci.yml` | E03-T1 | low | A3 | implementation | Build, typecheck e lint do console rodam em CI, além dos testes de publicação, conflito, rollback e autorização | Job verde com os testes citados |

**Aceite do épico:** cada tipo de entidade pode ser editado, validado e publicado; o runtime
usa a nova configuração; rollback restaura uma versão íntegra; alteração concorrente ou
inválida não sobrescreve trabalho existente.

---

## E04 — Runner e chamada de modelos governados

Responsável: Backend/LLM · Dependências: E01; interface inicial de E10 · Fase: F2
Natureza: extensão + integração de políticas

Estado atual: `scripts/kernel.sh` resolve `admit`, `breaker`, `hitl`, `risk`, `gates`,
`repair`, `waves`, `scale`, `route-escalate`, `resolve-task`. A documentação reconhece que as
decisões ainda não estão ligadas a transições reais de execução — é exatamente o que este
épico fecha.

| ID | Tarefa | Escopo | Dep | Risco | Aut. | Gate | Aceite verificável | Evidência |
|---|---|---|---|---|---|---|---|---|
| E04-T1 | Máquina de estados do run | novo `src/runner/state.ts` | E01-T10 | high | A1 | design | Estados `queued`, `running`, `waiting_approval`, `succeeded`, `failed`, `cancelled`, `timed_out` com transições persistidas e terminalidade explícita. Transição inválida é rejeitada, não corrigida | Teste de tabela de transições cobrindo todas as arestas inválidas |
| E04-T2 | Pinning de configuração por execução | `src/runner/` | E01-T10, E03-T12 | high | A1 | implementation | Cada run fixa `config_version`, identidade e escopo no início e não os relê durante a execução | Teste: publicar durante um run não altera o run em curso |
| E04-T3 | Admission antes do dispatch | `src/runner/` + `kernel.sh admit` | E04-T1 | high | A1 | implementation | Tarefa fora do limite recebe `defer` ou `reject` previsto e não é despachada | Teste com fila saturada |
| E04-T4 | Breaker antes do retry | `src/runner/` + `kernel.sh breaker` | E04-T3 | high | A1 | implementation | Breaker aberto impede a chamada; `half-open` libera apenas as sondas previstas | Teste dos três estados com resultado observado |
| E04-T5 | Prazo, cancelamento e limite de passos | `src/runner/` | E04-T1 | high | A1 | implementation | Prazo estourado termina em `timed_out`; cancelamento impede novos efeitos externos; limite de passos encerra sem sucesso falso | Teste de cancelamento durante chamada em andamento |
| E04-T6 | Orçamento reservado e reconciliado | `src/runner/budget.ts` | E04-T5 | high | A1 | implementation | Capacidade e orçamento são reservados antes de chamadas concorrentes; uso real é reconciliado ao concluir; estouro bloqueia novo dispatch | Teste concorrente com estouro de orçamento |
| E04-T7 | Aprovação persistida e invalidável | `src/runner/approval.ts` + `kernel.sh hitl` | E01-T11 | high | A0 | validation | Aprovação liga-se a ação, hash dos argumentos, destino e `config_version`. Mudança em qualquer um invalida. Confirmação já válida para a mesma ação não é repetida | Teste de invalidação por mudança de argumento e de destino |
| E04-T8 | Interface `ProviderAdapter` | novo `src/providers/types.ts` | E01-T9 | high | A1 | design | Contrato com schema de saída, timeout, erros tipados e capabilities declaradas. Provider e modelo sempre explícitos na requisição e na resposta | Contrato revisado + testes de tipo |
| E04-T9 | Adapter primário e adapter de prova | `src/providers/` | E04-T8 | medium | A2 | implementation | Um adapter em uso e um segundo implementado para comprovar portabilidade do contrato | Suíte de contrato executada nos dois adapters |
| E04-T10 | Resolução de modelo e fallback | `src/providers/resolve.ts`, `registries/models.json` | E04-T9 | high | A1 | implementation | Modelo e fallback são validados por disponibilidade e capacidade, não por nome de tier. Motivo do fallback é registrado; custo não medido é registrado como desconhecido, nunca como zero | Teste com modelo indisponível e com capacidade ausente |
| E04-T11 | Execução headless com envelope | `src/cli.ts`, `src/dispatch.ts` | E04-T5 | medium | A2 | implementation | Resposta estruturada com evidência de checks e handoff recuperável, conforme `templates/handoff.md`. Falha não vira sucesso por interpretação de prosa | Teste que injeta falha e confere status final |
| E04-T12 | Suíte de falhas do runner | `src/runner/*.test.ts` | E04-T1..T11 | medium | A2 | validation | Timeout, schema inválido, orçamento esgotado, breaker aberto e cancelamento têm estado final e efeitos verificados | Suíte automatizada em CI |

**Aceite do épico:** tarefas fora do limite não são despachadas; breaker aberto impede a
chamada; cancelamento impede novos efeitos; aprovação ausente bloqueia a ação que a exige;
falha não vira sucesso por interpretação de prosa.

---

## E05 — Observabilidade com dados reais

Responsável: Backend/DevOps · Dependência: E04 · Fase: F2 · Natureza: consolidação

Estado atual: `scripts/exec-journal.sh` e `scripts/telemetry.sh` existem;
`policy.json` `telemetry.exec_journal` já é checado por C27; ADR
`2026-09-03-spans-extend-exec-journal.md` fixa a direção.

| ID | Tarefa | Escopo | Dep | Risco | Aut. | Gate | Aceite verificável | Evidência |
|---|---|---|---|---|---|---|---|---|
| E05-T1 | Spans de model, tool e runner | `scripts/exec-journal.sh`, `src/runner/`, `hooks/lib-common.sh` | E04-T1 | medium | A2 | implementation | Contexto propagado permite reconstruir uma execução do início ao fim, incluindo chamadas aninhadas | Trace completo de uma execução real |
| E05-T2 | Taxonomia de resultado | `src/runner/`, `rules/observability.md` | E05-T1 | medium | A2 | design | Erro técnico, bloqueio de política e resultado degradado são distinguíveis sem ler texto do agente | Teste que classifica os três casos |
| E05-T3 | Uso, latência e custo com disponibilidade | `src/providers/`, `scripts/telemetry.sh` | E05-T1 | high | A1 | implementation | Tokens reportados, latência e custo calculável são capturados; campo de disponibilidade distingue zero medido de ausência de medição | Comparação entre uso registrado e resposta do provider |
| E05-T4 | Exportação OpenTelemetry | novo `src/telemetry/otlp.ts` | E05-T2 | medium | A2 | implementation | Spans exportados por OTLP para um coletor configurável; falha de exportação não derruba a execução | Coletor recebendo trace de ponta a ponta |
| E05-T5 | Dashboard e alertas | infraestrutura de observabilidade | E05-T4 | medium | A2 | validation | Dashboard mostra sucesso por tipo de tarefa, custo, latência, retries, filas, bloqueios e bypass. Cada alerta tem proprietário nominal | Alerta sintético chegando ao responsável |
| E05-T6 | Redação de conteúdo sensível | `scripts/telemetry.sh`, `src/telemetry/` | E05-T1 | high | A0 | validation | Logs não contêm prompts, segredos nem conteúdo pessoal por padrão. Ativação de captura ampliada é decisão explícita e registrada | Teste com segredo plantado que não aparece na saída |
| E05-T7 | Breaker alimentado por resultado observado | `src/runner/`, `kernel.sh breaker` | E05-T2, E04-T4 | high | A1 | implementation | Estado do breaker é persistido, com janela, chave de recurso e recuperação definidas. Falha detectada por resultado, não por texto | Teste de abertura e recuperação do breaker |
| E05-T8 | SLOs e limites de capacidade | `docs/DEPLOYMENT-PROFILES.md` | E05-T5 | high | A1 | release | SLOs por classe de tarefa e limites de capacidade definidos antes da liberação, com baseline de homologação. Revisão posterior preserva a evidência anterior | Baseline versionada + metas assinadas |
| E05-T9 | Registro independente de bypass | `hooks/`, `scripts/telemetry.sh` | E05-T1 | high | A1 | validation | Uso de bypass é registrado por caminho independente dos mecanismos que ele desliga. O registro deixa claro que controle local é alterável pelo operador | Teste com bypass ativo gerando registro |
| E05-T10 | Retenção e expiração | `policy.json` `telemetry.retention_days` | E05-T6 | medium | A2 | validation | Expiração e retenção são demonstráveis: dado além da janela não é recuperável | Teste de expiração com relógio controlado |
| E05-T11 | Runbook de diagnóstico | novo `docs/runbooks/` | E05-T5 | low | A3 | implementation | Runbook permite localizar latência entre modelo, tool, fila e retries sem conhecimento tácito | Execução do runbook por pessoa que não o escreveu |

**Aceite do épico:** reconstruir uma execução do início ao fim; comparar uso com resposta do
provider; detectar falha sem depender do texto do agente; demonstrar expiração e retenção.

---

## E06 — Evals de comportamento e eficácia

Responsável: QA/LLM · Dependências: baseline em E01; métricas completas após E04/E05
Fase: começa em F0, bloqueia a partir de F2 · Natureza: consolidação

Estado atual: `evals/intent-routing-cases.jsonl` (33 casos), `evals/agent-cases.jsonl`
(16 casos), `evals/RUBRIC.md`, `.github/workflows/live-evals.yml`. Na execução citada na
análise, os 33 casos live foram ignorados — não há evidência de precisão live nessa corrida.

| ID | Tarefa | Escopo | Dep | Risco | Aut. | Gate | Aceite verificável | Evidência |
|---|---|---|---|---|---|---|---|---|
| E06-T1 | Separar as quatro camadas | `scripts/run-evals.sh`, `evals/` | — | medium | A2 | design | Checks estruturais, testes do kernel, testes do runner e avaliações live são executáveis e reportáveis separadamente. Resultado de uma camada não é apresentado como da outra | Relatório por camada |
| E06-T2 | Versionar dataset, scorer e configuração | `evals/`, formato de resultado | E06-T1 | medium | A2 | implementation | Todo resultado grava versões de dataset, scorer, prompt, modelo e configuração | Resultado auditável reexecutável |
| E06-T3 | Ampliar cobertura de casos | `evals/*.jsonl` | E06-T1 | medium | A2 | implementation | Suíte inclui português, solicitação ambígua, ação perigosa, tool indisponível e combinação de domínios | Contagem por categoria + revisão dos casos |
| E06-T4 | Métricas de comportamento | `scripts/run-evals.sh`, `evals/RUBRIC.md` | E06-T2 | medium | A2 | implementation | Seleção de tool, argumentos, conclusão real por pós-condição, groundedness, recusa indevida, vazamento, custo e latência são medidos. Conclusão é comprovada por pós-condição, não por afirmação do agente | Execução com pós-condições verificadas |
| E06-T5 | Judge calibrado | `evals/` | E06-T4 | medium | A2 | validation | Judge tem calibração contra revisão humana e o desacordo é reportado, não ocultado | Relatório de concordância |
| E06-T6 | Gatilhos de execução | `.github/workflows/ci.yml`, `.github/workflows/live-evals.yml` | E06-T2 | medium | A2 | implementation | Determinísticos rodam em PR; subconjunto live roda em mudança de prompt, binding de modelo ou política relevante; suíte ampla é agendada com teto de custo | Configuração dos workflows + custo por corrida |
| E06-T7 | Regressão plantada bloqueante | CI | E06-T6 | high | A1 | validation | Regressão plantada reprova a mudança em CI ou staging e preserva dataset, versão e resultados | Corrida vermelha reproduzível |
| E06-T8 | Baseline e piloto comparáveis | `docs/plan/2.0/` | E01-T4, E05-T3 | medium | A2 | release | Retrabalho, defeitos escapados e tempo de entrega comparados por classe e risco de tarefa, sem atribuir causalidade a amostra pequena | Baseline e piloto com n declarado |
| E06-T9 | Marcação de não medido | `scripts/run-evals.sh` | E06-T1 | high | A1 | validation | Caso pulado, custo desconhecido e erro de infraestrutura aparecem como não medidos e nunca como aprovados | Relatório com casos pulados destacados |

**Aceite do épico:** toda mudança relevante tem comparação antes/depois; casos críticos de
autorização e vazamento têm zero falhas no conjunto acordado; demais limites são definidos
antes da execução. Aprovação do conjunto não é garantia universal de segurança.

---

## E07 — Memória e promoção de aprendizado

Responsável: LLM/Backend · Dependências: E01/E05; E06 para regressão · Fase: F3
Natureza: consolidação + extensão

Estado atual: `rules/memory.md`, `docs/specs/2026-09-03-agent-memory-architecture-design.md`,
`skills/retro/SKILL.md`, `.engineos/skill-observations/log.md` e `.engineos/archived/`.

**Correção verificada em 06/09/2026:** `promotion_threshold` aparece apenas no spec de desenho
(`docs/specs/2026-09-03-agent-memory-architecture-design.md`). `registries/policy.json` **não
tem bloco `memory`** — conferido por leitura das chaves de topo. Portanto E07 começa com um
contrato ausente, não com um valor a ajustar: criar o bloco `memory` em `policy.json` e o
check correspondente em `scripts/checks/` é pré-requisito de E07-T3. É um caso concreto do
risco R06 — a política existe em prosa e não existe como dado aplicável.

| ID | Tarefa | Escopo | Dep | Risco | Aut. | Gate | Aceite verificável | Evidência |
|---|---|---|---|---|---|---|---|---|
| E07-T1 | Chave estável de agrupamento | `src/memory/`, `rules/memory.md` | — | medium | A2 | design | Episódios equivalentes agrupam sob a mesma chave; a chave não muda por reformulação de texto | Teste com três formulações do mesmo episódio |
| E07-T2 | Proveniência, data e status | `src/memory/` | E07-T1 | medium | A2 | implementation | Todo registro carrega fonte, data, validade e status. Registro sem data é relatado, não descartado em silêncio | Relatório de registros sem data |
| E07-T3 | `promote-candidates --since` | novo `scripts/promote-candidates.sh`; bloco `memory` a criar em `registries/policy.json` | E07-T2 | medium | A2 | implementation | Contagem usa ocorrências independentes; duplicatas não inflacionam. Três episódios independentes produzem um candidato com três fontes | Teste de agrupamento e deduplicação |
| E07-T4 | Retro com saída estruturada | `skills/retro/SKILL.md` | E07-T3 | medium | A2 | implementation | Retro gera proposta rastreável com fontes; nenhum agente altera conhecimento procedural sozinho | Proposta gerada + revisão humana registrada |
| E07-T5 | TTL, supersessão e exclusão | `src/memory/` | E07-T2 | high | A1 | validation | Fato revogado ou expirado não retorna como atual; supersessão preserva histórico | Teste de revogação seguido de recuperação |
| E07-T6 | ACL por projeto | `src/memory/` | E07-T5 | high | A0 | validation | Memória de outro projeto não aparece na recuperação, mesmo com consulta que a favoreça | Teste negativo de vazamento entre projetos |
| E07-T7 | Recuperação limitada por tarefa | `src/memory/` | E07-T6 | medium | A2 | implementation | Recuperação respeita orçamento por tarefa e não injeta memória irrelevante | Medição de precisão da recuperação |
| E07-T8 | Lexical vs semântico antes de indexar | experimento | E07-T7 | low | A3 | design | Decisão de adotar índice adicional é sustentada por comparação medida, não por preferência | Experimento com resultados versionados |

**Aceite do épico:** três episódios independentes produzem um candidato com três fontes;
duplicatas não inflacionam contagem; nenhum agente altera regras sozinho; memória excluída
ou de outro projeto não aparece na recuperação.

---

## E08 — RAG compartilhado para o produto

Responsável: LLM/Data · Dependências: E04/E06; autorização de E10 · Fase: F3
Natureza: expansão do produto

| ID | Tarefa | Escopo | Dep | Risco | Aut. | Gate | Aceite verificável | Evidência |
|---|---|---|---|---|---|---|---|---|
| E08-T1 | Corpus autorizado e golden set congelado | `docs/`, novo `rag/` | E10-T3 | high | A1 | design | Corpus inicial é documentação técnica autorizada; golden set é congelado antes de qualquer otimização | Golden set versionado com data de congelamento |
| E08-T2 | Ingestão incremental | `rag/ingest/` | E08-T1 | medium | A2 | implementation | Ingestão usa hash e versão, faz chunking por estrutura, grava metadados e ACL, e é retomável | Reingestão idempotente comprovada |
| E08-T3 | Documento como entrada não confiável | `rag/ingest/`, `rules/security.md` | E08-T2 | high | A0 | validation | Conteúdo recuperado não é tratado como instrução. Injeção plantada no corpus não altera comportamento | Teste adversarial com documento hostil |
| E08-T4 | Versionamento de embeddings | `rag/index/` | E08-T2 | medium | A2 | implementation | Embedding é versionado por conteúdo, modelo e configuração; cache é invalidado em exclusão, mudança de ACL ou de índice | Teste de invalidação por cada gatilho |
| E08-T5 | Recuperação híbrida e reranking | `rag/retrieve/` | E08-T4 | medium | A2 | implementation | Lexical + vetorial com fusão e reranking, adotados por experimento comparativo contra o golden set | Experimento com baseline e variante |
| E08-T6 | Orçamento de contexto | `rag/retrieve/` | E08-T5 | medium | A2 | implementation | Contexto injetado respeita orçamento declarado; truncamento é registrado | Medição de tamanho por consulta |
| E08-T7 | Métricas separadas | `rag/evals/` | E08-T5, E06-T2 | medium | A2 | validation | Recall@K, Precision@K e MRR são reportados separadamente de groundedness e faithfulness. K, thresholds e freshness são fixados antes de aceitar alteração | Benchmark versionado |
| E08-T8 | Atualização, exclusão e reindexação | `rag/index/` | E08-T4 | high | A1 | validation | Exclusão e atualização se refletem dentro do SLA declarado; reindexação é recuperável | Teste de SLA cronometrado |
| E08-T9 | Resposta com fontes e abstinência | `rag/answer/` | E08-T7 | high | A1 | validation | Resposta cita fontes; sem evidência suficiente, o sistema se abstém em vez de afirmar | Casos de abstinência no golden set |
| E08-T10 | ACL negativa | `rag/retrieve/` | E08-T2, E10-T3 | high | A0 | validation | Consulta não recupera conteúdo sem permissão, inclusive por consulta construída para tanto | Teste adversarial de ACL |

**Aceite do épico:** métricas de recuperação e geração têm baseline versionada; consulta não
recupera conteúdo sem permissão; exclusão e atualização se refletem dentro do SLA declarado;
resposta sem suporte não é apresentada como fato.

---

## E09 — Filas, workers e recuperação distribuída

Responsável: Backend/DevOps · Dependências: E04/E05/E10 e E06 contínuo · Fase: F4
Natureza: expansão. Só é bloqueante se o perfil distribuído entrar na release.

| ID | Tarefa | Escopo | Dep | Risco | Aut. | Gate | Aceite verificável | Evidência |
|---|---|---|---|---|---|---|---|---|
| E09-T1 | ADR de banco e fila | `docs/adr/` | E01-T12 | high | A1 | design | Escolha justificada por requisitos de recuperação, carga, operação e equipe — não por preferência de stack | ADR aceita com requisitos citados |
| E09-T2 | Persistência de runs, checkpoints, eventos e aprovações | `src/runner/store/` | E09-T1, E04-T1 | high | A1 | implementation | Estado sobrevive a reinício do processo; aprovação e configuração são recuperadas junto do checkpoint | Teste de reinício no meio da execução |
| E09-T3 | Claim com lease, heartbeat e fencing | `src/worker/` | E09-T2 | high | A1 | implementation | Worker que perdeu o lease não consegue escrever depois; token de fencing rejeita escrita atrasada | Teste com worker antigo tentando escrever |
| E09-T4 | Retries limitados e fila de falhas | `src/worker/` + `policy.json` `retry` | E09-T3 | medium | A2 | implementation | Falha esgota retries e fica visível em fila de falhas; nunca desaparece em silêncio | Teste de esgotamento com item na DLQ |
| E09-T5 | Idempotência por efeito | `src/worker/idempotency.ts` | E09-T3 | high | A0 | validation | Chave de idempotência por efeito; operação incerta consulta resultado externo antes de repetir. Matar worker após efeito externo e antes do ack não duplica o efeito no cenário suportado | Teste de caos com efeito observável |
| E09-T6 | Outbox para eventos | `src/worker/outbox.ts` | E09-T2 | high | A1 | implementation | Transação de estado que precisa publicar evento usa outbox; limite é documentado quando o destino não suporta idempotência | Teste de falha entre commit e publicação |
| E09-T7 | Scheduler | `src/scheduler/` | E09-T2 | medium | A2 | implementation | Timezone, execução perdida e sobreposição são configuráveis e testados | Teste com relógio controlado |
| E09-T8 | API de status, cancelamento e resume | `src/api/` | E09-T2, E04-T5 | high | A1 | implementation | Cancelamento e resume atravessam workers; resume revalida autorização | Teste de resume após revogação |
| E09-T9 | Backpressure por projeto e provider | `src/worker/` + `policy.json` `parallelism.backpressure` | E09-T4 | medium | A2 | validation | Sobrecarga resulta em `defer` ou `reject` previsto, não em degradação silenciosa | Teste de saturação |
| E09-T10 | Teste de caos multi-worker | staging | E09-T5, E09-T6 | high | A1 | validation | Lease expirado e confirmação perdida não produzem efeito duplicado nem estado inconsistente | Relatório do teste em staging |
| E09-T11 | Teste de carga | staging | E09-T9 | high | A1 | release | Volume declarado sustentado com margem; resultados comparados às metas de E05-T8 | Relatório de carga |

**Aceite do épico:** matar worker após efeito externo e antes do ack não duplica o efeito no
cenário suportado; checkpoint retoma sem perder aprovação ou configuração; sobrecarga resulta
em defer/reject previsto; falha esgota retries e fica visível. A fila isoladamente não garante
exactly-once — a garantia real é documentada.

---

## E10 — Registry operacional de tools/MCPs e permissões

Responsável: Backend/Security · Dependência: E01; contratos desenvolvidos junto com E04
Fase: F1 (contrato) e F2 (aplicação) · Natureza: extensão operacional

Estado atual: `templates/mcp.template.json` é template, não registry operacional. Não há
autorização por recurso aplicada no servidor.

| ID | Tarefa | Escopo | Dep | Risco | Aut. | Gate | Aceite verificável | Evidência |
|---|---|---|---|---|---|---|---|---|
| E10-T1 | Modelo de registry | novo `registries/tools.json` + schema | E01-T4 | high | A1 | design | Tool, server, versão, transporte, capabilities, schemas, risco, projetos permitidos e referência a segredo modelados. Segredo é referência, nunca valor | Schema revisado + validação em CI |
| E10-T2 | Ciclo de vida operacional | `src/tools/registry.ts` | E10-T1 | medium | A2 | implementation | Ativação, desativação, health-check, timeout, rate limit e auditoria existem. Mudança de catálogo exige validação antes de ampliar acesso | Teste de ativação bloqueada sem validação |
| E10-T3 | Autorização no servidor | `src/tools/authz.ts` | E10-T1 | high | A0 | design | Autorização por agente, operação e recurso é decidida no servidor, não no prompt. Agente de leitura não consegue escrever por outra tool | Teste adversarial de escalada de privilégio |
| E10-T4 | Reverificação na execução | `src/tools/authz.ts`, `src/runner/` | E10-T3, E04-T7 | high | A0 | validation | Autorização é reconferida no momento da execução, inclusive após pause/resume. Revogação afeta execução retomada | Teste de revogação durante pausa |
| E10-T5 | Classificação de efeito | `registries/tools.json` | E10-T1 | high | A1 | design | Leitura, escrita reversível e efeito irreversível são distintos e dirigem a exigência de aprovação | Matriz de efeito por tool |
| E10-T6 | Aprovação vinculada ao escopo | `src/tools/`, `src/runner/approval.ts` | E10-T5, E04-T7 | high | A0 | validation | Aprovação vale para o escopo exato; credenciais são usadas fora do contexto do modelo | Teste de aprovação reutilizada em escopo diferente sendo negada |
| E10-T7 | Validação de schema e limites | `src/tools/` | E10-T1 | medium | A2 | implementation | Argumentos são validados contra schema; entradas e saídas têm limite de tamanho | Teste com payload fora do limite |
| E10-T8 | Prompt injection e indisponibilidade | `src/tools/`, `evals/` | E10-T7, E06-T3 | high | A0 | validation | Resultado de tool não é seguido como instrução; MCP indisponível degrada de forma prevista | Casos adversariais no conjunto de evals |
| E10-T9 | Integração com console e breaker | `console/src/lib/entities/tools.ts`, `kernel.sh breaker` | E10-T2, E03-T3, E04-T4 | high | A1 | implementation | MCP desabilitado não recebe nova chamada; falhas alimentam o breaker do recurso | Teste de desabilitação com chamada subsequente negada |
| E10-T10 | Rotação e revogação de credenciais | `docs/runbooks/` | E10-T1 | high | A1 | release | Rotação e revogação são documentadas e executáveis sem expor valores | Ensaio de rotação registrado |
| E10-T11 | Testes adversariais na fronteira | `src/tools/*.test.ts` | E10-T3..T8 | high | A0 | validation | Chamada perigosa sem autorização é negada na fronteira real de execução, com negação auditada e ausência de escrita comprovada | Suíte adversarial em CI |

**Aceite do épico:** agente de leitura não consegue escrever via outra tool; MCP desabilitado
não recebe novas chamadas; revogação afeta execuções retomadas; chamada perigosa sem
autorização é negada na fronteira real.

---

## Contagem e distribuição

| Épico | Tarefas | Risco high | Autonomia A0 | Fase |
|---|---|---|---|---|
| E01 | 13 | 3 | 0 | F0 |
| E02 | 10 | 3 | 0 | F0 |
| E03 | 18 | 11 | 1 | F1 |
| E04 | 12 | 9 | 1 | F2 |
| E05 | 11 | 5 | 1 | F2 |
| E06 | 9 | 3 | 0 | F0→F2 |
| E07 | 8 | 2 | 1 | F3 |
| E08 | 10 | 6 | 2 | F3 |
| E09 | 11 | 8 | 1 | F4 |
| E10 | 11 | 9 | 5 | F1→F2 |
| **Total** | **113** | **59** | **12** | |

Doze tarefas com autonomia A0 exigem decisão humana explícita antes do efeito: são as
fronteiras de autorização, aprovação, ACL e redação de dado sensível. Nenhuma delas pode ser
absorvida por automação sem mudar a política em `registries/policy.json`.
