# Monetization — receita escondida nos ativos que já existem no EngineOS

Date: 2026-07-30 · Mode: monetization · Confidence: **medium**
(inventário de ativos: alta — lido em disco e citado; preços: média — fontes datadas, mas
majoritariamente agregadores secundários; demanda: **baixa** — nenhuma venda, nenhuma
conversão histórica, audiência UNKNOWN.)

> **Isto não é consultoria financeira nem jurídica.** São faixas de estimativa com a
> aritmética exposta para você mesmo ajustar as premissas. Nenhum número aqui é previsão.
> Onde há contrato de trabalho, cláusula de PI, ou confidencialidade de cliente, a decisão
> exige um advogado — este relatório apenas sinaliza onde o risco está.

---

## Headline

Os três ativos monetizáveis em 30 dias **não são o EngineOS** — são o gerador de
documentação de sistema legado em português (`patterns/1-Analisys` +
`agents/architecture-analyst.md`), o sistema de quality gates testado
(`hooks/` + 5 suítes de teste) e o conhecimento de portabilidade Cursor
(`docs/specs/2026-06-19-cursor-adapter-design.md`); todos vendem 1:1 para um comprador
nomeado e **nenhum deles depende do repositório ser público nem de você ter audiência** —
que é exatamente por que são os únicos ativáveis agora.

---

## Grounding

### Projeto (lido, não inferido)

| Arquivo | O que prova |
|---|---|
| `CLAUDE.md` (9.190 bytes) | Constituição + tabela de roteamento de ~25 intents; 7 non-negotiables |
| `rules/*.md` (12 arquivos, 492 linhas) | Padrões declarativos DO/DON'T; `rules/parallelism.md:1-57` e `rules/models.md:1-41` são doutrina própria, não repackaging |
| `skills/*/SKILL.md` (8 skills, 558 linhas) | `skills/nestjs-patterns/SKILL.md` (100 linhas) é o maior; `skills/record-change/SKILL.md` (74) codifica o ciclo de governança |
| `agents/*.md` (18 agentes, 1.205 linhas) | `agents/architecture-analyst.md` (120), `agents/mobile-coordinator.md` (112), `agents/ios-builder.md` (102), `agents/android-builder.md` (110), `agents/qa-tester.md` (109) |
| `hooks/hooks.json:1-56` | 5 eventos ligados: UserPromptSubmit, PreToolUse, PostToolUse (2), Stop (2) |
| `hooks/stop-verify.sh` (167 linhas) | Gate real: lint+typecheck+test escopado ao pacote alterado, detecção Nx, runner pnpm/yarn/npm por lockfile |
| `hooks/routing-map.sh:10-72` | Mapa canônico path→domínio (security → tests → backend → dba → devops → frontend → llm) |
| `hooks/test-verify.sh` (136), `test-layout.sh` (65), `test-governance.sh` (42), `test-route.sh` (38), `test-task-scale.sh` (37) | Os hooks têm suíte de teste própria — 941 linhas de shell no total em `hooks/` |
| `install.sh` (171 linhas) | Secrets gate fail-closed sobre `git ls-files` |
| `install.ps1` (293 linhas), `install.ps1:20-35` | Porta Windows com 14 padrões de regex de segredo — **e não está no git** (`git status` → `?? install.ps1`; `git ls-files` só devolve `install.sh`) |
| `docs/specs/2026-06-19-cursor-adapter-design.md:29-53` | Schema de hooks do Cursor levantado empiricamente: nomes de evento, exit 2 = block, reuso do nesting `tool_input`, schema de saída por evento, matchers em regex JS, comandos sem namespace |
| `templates/cursor/commands/{audit,implement,production-env}.md` | Camada de portabilidade já entregue — o método não está preso ao Claude Code |
| `docs/specs/` (10 specs, 1.579 linhas) | `2026-06-19-project-layout-standard-plan.md` tem 645 linhas de plano executável |
| `.engineos/archived/**` (22 registros) | `2026-06-17-review-findings-fixes.md` documenta uma review pré-adoção com 1 CRITICAL (secrets gate inoperante no macOS), 6 commits, 27 arquivos |
| `docs/ADOPTION.md` (214 linhas) | Runbook de 9 passos com verificação por passo + tabela de troubleshooting |
| `docs/START.md` (199), `README.md` (137), `docs/PRD.md` (176), `docs/CONTRIBUTING.md` (58) | Conteúdo de onboarding já escrito |
| `templates/github/claude-review.yml`, `claude-security.yml` | Workflows de review em CI com prompt afinado (inclui a regra de PR ≤400 linhas) |
| `templates/mcp.template.json`, `templates/permissions.template.json`, `docs/ADOPTION.md:94-122` | Baseline de MCP + allowlist + doutrina de credencial read-only |
| `templates/project-claude.md`, `templates/project-layout/*` (4 arquivos) | Template de layout de projeto |
| `patterns/1-Analisys` (51 linhas, **escrito em PT-BR**) | Prompt de análise arquitetural: gera "Arquitetura do Sistema", "Objetivo do Sistema" e README por módulo, com regra explícita de marcar inferência como "hipótese" |
| `scripts/usage-report.sh:1-30` | Instrumento de medição: minera `~/.claude/projects/*.jsonl` por `[router] intent=` e invocação de skill |
| `scripts/gen-agent-commands.sh` + `commands/agents/` (33 arquivos) | Geração de slash commands com alias humano |
| `.github/workflows/ci.yml` | CI do próprio repo (shellcheck + testes de hook) |
| `LICENSE:1-3` | MIT, copyright "Ricardo Fagmer" — autoria única confirmada (brief §2: 83 commits, 100% dele) |

### Web (fonte + data)

- **Freelance Software Developer Rates by Country in 2026** — index.dev, **2026-05-27** (fetch):
  Brasil US$30–55/h média, sênior **US$40–75/h**; EUA sênior US$100–150/h; "AI agent
  developers" US$180–300/h; prêmio de 40–60% para AI/ML sobre generalista.
- **AI Consulting Costs 2026** — Winder.AI, **2026-06-24** (fetch): boutique sênior
  £200–400/h; **LLM application engineering £250–450/h**; offshore body-shop £40–120/h;
  POC de escopo fechado £15.000–40.000 (2–4 semanas).
- **Quanto custa uma consultoria de IA no Brasil** — Waxi, **2026-06-28** (fetch):
  diagnóstico + priorização **R$10.000–40.000** (3–6 semanas); primeiro caso de uso
  R$30.000–120.000; **retainer mensal R$5.000–20.000**; declara explicitamente que hora
  não é o formato dominante no Brasil (projeto fechado e mensalidade são).
- **Cost of Code Audit Services in 2026** — DevCom, **2026-02-18** (fetch): audit estático
  **US$5.000–8.000**, dinâmico US$8.000–16.000.
- **AI Readiness Audit Pricing 2026** — Pertama Partners, publicado 2026-02-08,
  **atualizado 2026-06-17** (fetch): organização <100 funcionários **SGD 15.000–35.000**,
  2–3 semanas, 1–2 consultores. Multiplicadores regionais publicados (Malásia 70–80% do
  baseline de Singapura, Vietnã/Filipinas 50–60%) — evidência de que a mesma entrega tem
  preço geográfico, não absoluto.
- **AI Training Cost in 2026** — TightSlice, **2026-07-01** (fetch): workshop custom
  on-site **US$2.500–5.000 por time**; full-day role-specific **US$5.000 para até 12
  pessoas**; coaching semanal intensivo US$1.500–3.000/mês.
- **$100 million for open source** — GitHub Blog, **2026-07-20** (fetch): 70.000+
  mantenedores, 280.000+ sponsors; ~40% do funding vem de organizações e cada patrocínio
  organizacional vale ~15× o individual.
- Buscas complementares (snippets, não fetchados — tratados como pista, não prova):
  goLance *Node.js Developer Hourly Rate Guide 2026* (sênior ~US$128/h, topo US$218/h);
  groovyweb *AI consulting rates 2026* (consultor solo US$80–200/h); *AI readiness audit*
  small business US$2.000–8.000; *boilerplate income* (Jake's Insights, 2026-04-26:
  boilerplates US$49–249, top sellers US$1.500–3.500/mês; taxa Gumroad 10% + ~2,9%+US$0,30);
  setups de Claude Code vendidos a **US$27–97** (Medium, abr/2026); *Consultant Daily Rate*
  (consultfees, 2026: day rate = 6–8× a hora, US$1.500–5.000/dia); fractional CTO advisory
  leve US$4.000–8.000/mês; **<12% dos devs de open source ganham qualquer receita** com isso.

### UNKNOWN (e o efeito de cada um na conclusão)

1. **Termos do vínculo empregatício: PI, exclusividade, moonlighting** — UNKNOWN (brief §6).
   Efeito: se houver cláusula de cessão de PI ou exclusividade cobrindo trabalho no mesmo
   campo, as rotas R1/R2/R7 **como desenhadas** ficam inválidas e a análise precisa ser
   rerodada como "publicar por reputação, não por receita". Não dou orientação jurídica —
   leia o contrato e, se houver dúvida, consulte um advogado **antes** de emitir a primeira
   proposta.
2. **Audiência fora do GitHub** (newsletter, YouTube, LinkedIn, comunidade) — UNKNOWN.
   Único número medido: **6 seguidores no GitHub** (brief §4). Efeito: toda rota cujo
   mecanismo é "vender para minha audiência" está **sem funding** e foi rebaixada abaixo
   das rotas 1:1. Se existir uma audiência de, digamos, 2.000 pessoas em LinkedIn, R4 sobe
   duas posições.
3. **Renda atual e urgência de caixa** — UNKNOWN. Efeito: define o trade-off caixa ×
   reputação. Se a urgência é caixa, a ordem abaixo está correta. Se não é, tornar o
   repositório público primeiro tem retorno composto maior — mas isso é a saída do modo
   *positioning*, não deste.
4. **Se o "time de 2–10 pessoas" do `docs/PRD.md:4` é um time real do empregador** — UNKNOWN.
   Efeito: é o lead mais quente possível e simultaneamente o de maior risco contratual.
5. **Preço de treinamento in-company técnico no Brasil por turma fechada** — **UNKNOWN**
   após 3 buscas distintas em português; nenhuma empresa brasileira de treinamento publica
   tabela (ohub, Hashtag Treinamentos, BT Company, Instituto Minere, KPMG Business School:
   todas "sob consulta"). Premissa usada onde precisei: razão Brasil/EUA de 35–50% derivada
   do índice index.dev (BR US$30–55 vs EUA US$95–110).
6. **Hora de consultoria de *engenharia de IA* no Brasil** — UNKNOWN. Só encontrei hora de
   dev genérico e bandas de projeto de consultoria de IA. A tabela publicada da TICOOP
   Brasil ("Arquiteto de Software (hora)") **não pôde ser buscada** — 302 para outro host.
7. **Procedência do conteúdo derivado de `leo-curso`** — `.engineos/archived/2026/06/19/2026-06-19-leo-curso-extract.md`
   registra que técnicas de material de curso de terceiro foram dobradas em
   `skills/nestjs-patterns/SKILL.md`. Efeito: para qualquer coisa **vendida ou publicada**,
   isso é uma questão de procedência aberta. O próprio registro diz que o framework
   opinativo do curso foi deliberadamente **não** adotado, o que ajuda, mas não resolve.
8. **Volumes de conversão** — não existe histórico (receita estruturalmente zero, brief §6).
   Todo volume abaixo é **premissa declarada**, não projeção.

---

## Analysis

### STEP 1 — Inventário dos ativos não monetizados

Classificados pelo que a monetização exige deles, não pelo que são tecnicamente.

#### Classe A — Conhecimento de problema difícil já resolvido (o mais subvalorizado)

- **A1. Gate de verificação que funciona em monorepo real** — `hooks/stop-verify.sh`.
  Não é "um hook": é a solução de quatro falhas que fazem os gates dos outros times
  serem desligados na segunda semana. Detecção de existência de target Nx via
  `nx show project --json` com guarda ancorada contra falso-positivo de cache
  (`hooks/stop-verify.sh:99-134`); extração de campo com `jq` **opcional**
  (`:11-19`); `timeout` portável com fallback `gtimeout`/no-op (`:60-62`); dedupe de
  diretórios de pacote seguro para caminhos com espaço (`:70-81`); escopo restrito a
  chamadas Edit/Write do transcript, para que apenas *ler* um arquivo não arraste o
  pacote para a suíte (`:31-41`). Alguém está pagando hoje para descobrir isso.
- **A2. Schema de hooks do Cursor levantado empiricamente** —
  `docs/specs/2026-06-19-cursor-adapter-design.md:29-53`. Nomes de evento, `exit 2` como
  mecanismo de block, reuso do nesting `tool_input` do Claude Code, schema de saída
  **diferente por evento** (`{permission,user_message,agent_message,updated_input}` vs
  `{additional_context}` vs `{followup_message}`), matchers em regex **JavaScript** e não
  POSIX, comandos sem namespace. Este é o ativo de conhecimento com maior diferencial e
  menor concorrência no inventário — e ele prova, junto com
  `templates/cursor/commands/*.md` já entregues, que **o método não está preso ao Claude
  Code**. Isso muda a conversa de venda: você não está vendendo dependência de um vendor.
- **A3. Arquitetura "single-source core + thin adapters"** —
  `docs/specs/2026-06-19-cursor-adapter-design.md:55-68`: lógica pura em
  `hooks/lib/<name>.core.sh`, adaptadores finos por host. É decisão de design reusável,
  não código.
- **A4. Secrets gate fail-closed, em duas linguagens** — `install.sh` (sobre
  `git ls-files`, ou seja, só arquivos rastreados) e `install.ps1:20-35` (14 padrões:
  `sk-ant-`, `sk-proj-`, AKIA, `gh[opsu]_`, `github_pat_`, `glpat-`, `AIza`, `ATATT`,
  `xox[baprs]-`, chave privada PEM, `private_key_id`, e URL com credencial embutida). O
  registro `2026-06-17-review-findings-fixes.md` mostra que este gate **já estava quebrado
  no macOS** e foi consertado — isto é conhecimento cicatrizado, não teórico.
- **A5. Doutrina de fan-out paralelo e tiers de modelo** — `rules/parallelism.md` (57
  linhas: gatilhos, congelamento de contrato antes do fan-out, escopo de arquivo disjunto,
  cap de ~6 agentes por wave, grafo de agentes plano) e `rules/models.md` (41 linhas:
  quatro tiers, precedência dispatch > frontmatter > sessão, regras de escalonamento).
  Escrito 2026-07-30; é a peça mais nova e a mais difícil de encontrar publicada.

#### Classe B — Conteúdo que já é 80% de um artefato pago

- **B1. `docs/ADOPTION.md` (214 linhas)** — runbook de 9 passos, cada um com "o que faz" e
  "como verificar", mais tabela de troubleshooting com causa-raiz
  (`docs/ADOPTION.md:189-200`) e tabela specialist→MCP→credencial (`:102-109`). Isto é
  literalmente o roteiro de um workshop de meio dia, já escrito.
- **B2. `docs/START.md` (199 linhas)** — manual de operação diária, com modelo mental em
  diagrama (`docs/START.md:12-27`).
- **B3. 10 design specs (1.579 linhas)** em `docs/specs/`, incluindo um plano executável de
  645 linhas (`2026-06-19-project-layout-standard-plan.md`).
- **B4. 22 registros de mudança arquivados** em `.engineos/archived/**` — cada um com
  What/Why/Scope/Verification/Changes-registered. Este é o corpus que prova disciplina de
  processo a um comprador cético, e é o tipo de evidência que quase ninguém consegue
  mostrar.
- **B5. `patterns/1-Analisys` (51 linhas, em português)** — prompt de análise arquitetural
  com regras anti-invenção explícitas ("Nunca invente comportamento que não exista no
  código", "Inferências devem ser marcadas explicitamente como 'hipótese'") e três
  artefatos de saída definidos. Combinado com `agents/architecture-analyst.md` (120
  linhas) e `patterns/2-Interview-brainstorm.md`, é um serviço embalado esperando um
  cliente. **O ativo mais vendável do repositório inteiro** — e o único já em PT-BR.

#### Classe C — Processo e ferramental que funciona

- **C1. Sistema de quality gates completo** — `hooks/hooks.json` liga 5 eventos;
  `hooks/route-before-change.sh` (64) + `hooks/routing-map.sh` (72) fazem roteamento
  determinístico por padrão de caminho; `hooks/post-edit-check.sh` (84) roda lint+typecheck
  escopado; `hooks/mark-unrecorded.sh` (33) + `hooks/record-verify.sh` (26) forçam o
  registro de mudança; `hooks/ensure-project-layout.sh` (59) + `hooks/layout-manifest.sh`
  (17) fazem scaffold; `hooks/task-scale-advisor.sh` (45) sugere fan-out. **Com 5 suítes
  de teste** (`hooks/test-*.sh`, 318 linhas somadas). Um processo com testes é um produto.
- **C2. Instalador multiplataforma** — `install.sh` (171) + `install.ps1` (293),
  idempotentes, com merge não-destrutivo em `~/.claude/settings.json` e backup
  write-once. **Risco imediato: `install.ps1` está UNTRACKED** — existe apenas nesta
  máquina. É o único ativo do inventário que pode ser perdido com um `git clean` ou um
  HD queimado.
- **C3. Templates de review em CI** — `templates/github/claude-review.yml` e
  `claude-security.yml`, com prompt afinado (proíbe achado inventado, exige file:line,
  sinaliza PR >400 linhas).
- **C4. Baseline de MCP + allowlist de permissões** — `templates/mcp.template.json`,
  `templates/permissions.template.json`, e a doutrina de credencial read-only
  (`docs/ADOPTION.md:94-122`). Note que a allowlist **não** auto-aprova ferramentas de
  escrita de MCP — decisão de menor privilégio, defensável em venda.
- **C5. Camada de portabilidade Cursor entregue** —
  `templates/cursor/commands/{audit,implement,production-env}.md`.
- **C6. Gerador de slash commands** — `scripts/gen-agent-commands.sh` → 33 arquivos em
  `commands/agents/`.

#### Classe D — Integrações já construídas

- **D1. 5 leaf specialists ligados a MCP** — `agents/postgres-specialist.md`,
  `agents/oracle-specialist.md`, `agents/kubernetes-specialist.md`,
  `agents/gcp-specialist.md`, `agents/cicd-specialist.md`, com o contrato
  "`UNKNOWN — no access` em vez de adivinhar" (`docs/ADOPTION.md:90-92`).
- **D2. Agentes de release de loja** — `agents/ios-builder.md` (102) e
  `agents/android-builder.md` (110): pipeline de preflight → bump → gates → build assinado
  → upload de track/TestFlight. Cobre uma dor caríssima e mal documentada.
- **D3. Espelho web→mobile** — `agents/mobile-coordinator.md` (112) +
  `docs/specs/2026-07-13-elias-web-to-mobile-mirror-design.md`.
- **D4. QA end-to-end de API** — `agents/qa-tester.md` (109): Docker limpo, inventário de
  endpoints em JSON, coleção Postman, run headless com Newman.

#### Classe E — Dados e benchmarks que só ele tem — **HOPE, NÃO ATIVO**

Aqui o playbook exige honestidade e a resposta é desconfortável:

- `scripts/usage-report.sh` é o instrumento correto — mina transcripts locais por
  `[router] intent=` e por invocação de skill. **Mas nenhuma saída dele está armazenada em
  lugar algum do repositório.**
- `.engineos/memory/` contém **apenas `README.md`** (1.273 bytes) depois de 22 mudanças
  concluídas (confirma brief §5.3).
- Portanto: "benchmarks que só eu tenho" é **hope**, não ativo. Não existe um único número
  medido de antes/depois — nem tempo de review, nem taxa de retrabalho, nem
  falhas-pegas-por-hook por semana, embora `docs/PRD.md:147-157` defina exatamente essas
  métricas. O corpus de 22 registros é evidência de *disciplina*, não de *ganho*.
- Consequência comercial direta: **nenhuma proposta pode prometer ganho percentual.** Toda
  proposta deve vender entrega concreta (documento, auditoria, ambiente instalado), nunca
  ROI. Isso também significa que instrumentar a próxima mudança com
  `scripts/usage-report.sh` cria o primeiro ativo de dados — mas isso é construção, e o
  playbook proíbe rotas que precisam ser construídas antes de faturar.

#### Não-ativos (registrados para você parar de contá-los)

- **Audiência**: 6 seguidores no GitHub (brief §4). Não é canal.
- **Repositório**: privado — os dois caminhos de instalação documentados
  (`README.md:18`, `README.md:24-25`) não funcionam para ninguém além de você (brief §3).
  Zero adotantes possíveis hoje.
- **Marketplace de plugin** (`.claude-plugin/marketplace.json`, `plugin.json` v1.2.0):
  pronto, e inerte enquanto o repo for privado.

---

### STEP 2 — Uma rota por ativo (ativável em <30 dias, sem investimento novo)

Todo preço abaixo carrega fonte + data. Todo volume é premissa declarada.
Câmbio usado onde comparo moedas: **US$1 ≈ R$5,40** — premissa, não cotação verificada
(não pesquisei taxa de câmbio; ajuste você mesmo).

---

#### R1 — Serviço de escopo fechado: instalar e adotar o ambiente em um time

- **Ativo:** C1 + C2 + C4 + C3 + B1 (`hooks/`, `install.sh`/`install.ps1`,
  `templates/mcp.template.json`, `templates/github/*.yml`, `docs/ADOPTION.md`).
- **Modelo:** serviço de escopo fechado, preço fixo. Entrega: ambiente instalado, gates
  ligados e provados, `CLAUDE.md` de projeto escrito, 1 MCP read-only conectado, 2 CI
  workflows ativos, 1h de handoff gravada.
- **Esforço:** 14–20h (o runbook já existe; o trabalho é o delta do projeto do cliente).
  Cabe em **uma semana** das 20h+.
- **Preço e aritmética:**
  - Brasil: 16h × R$220–350/h = **R$3.500–5.600**. A hora ancora em index.dev (sênior BR
    US$40–75/h ≈ R$216–405/h, 2026-05-27). Como pacote fechado — formato dominante no
    Brasil segundo Waxi (2026-06-28) — **R$6.000–12.000** fica dentro do piso da banda de
    "diagnóstico" publicada (R$10.000–40.000) e abaixo dela, o que é a posição correta
    para um primeiro cliente sem case.
  - Internacional remoto: 16h × US$100–180/h = **US$1.600–2.900**; como fixed-fee, a banda
    de "AI readiness audit small business" US$2.000–8.000 (busca, 2026) e o piso Pertama
    <100 funcionários SGD 15.000–35.000 (2026-06-17) mostram que **US$2.500–4.000** é
    conservador, não agressivo.
  - Volume premissa: 1–2 fechamentos em 30 dias, e **só** se houver um lead quente já
    existente.
  - **Faixa: R$6.000–24.000 (BR) ou US$2.500–8.000 (intl) em 30 dias.**
- **Dependências e bloqueios:** é a rota com **maior sobreposição com o emprego** — o
  comprador natural é o time de 2–10 pessoas do `docs/PRD.md:4`, que pode ser o time do
  empregador (UNKNOWN #4). Vender para o próprio empregador é onde cláusula de
  moonlighting morde mais forte. Não avance nisso sem ler o contrato.

---

#### R2 — Auditoria paga: governança de engenharia assistida por IA

- **Ativo:** A1 + C1 + `commands/audit.md` + `agents/audit-consolidator.md` + C6.
- **Modelo:** auditoria paga, preço fixo, entregável escrito (relatório com
  STATUS + plano de remediação, exatamente o formato que `docs/ADOPTION.md:158-162` já
  descreve). Escopo: o setup de Claude Code/Cursor do time do cliente — o que roteia, o
  que verifica, o que vaza segredo, o que não é reprodutível em máquina nova.
- **Esforço:** 8–12h por auditoria. Duas por mês cabem folgadamente nas 20h+.
- **Preço e aritmética:**
  - Piso de mercado citado: audit **estático** de código US$5.000–8.000 (DevCom,
    2026-02-18); *AI readiness audit* small business US$2.000–8.000 (busca, 2026); Pertama
    <100 funcionários SGD 15.000–35.000 por 2–3 semanas com 1–2 consultores (2026-06-17).
    Um solo entregando em 1 semana precisa ficar **abaixo** de todos esses pisos.
  - Brasil: **R$4.000–9.000** por auditoria (10h × R$400–900/h efetiva). Consistente com a
    banda de diagnóstico Waxi R$10.000–40.000 sendo escopo maior (3–6 semanas).
  - Internacional: **US$1.500–4.000** por auditoria (10h × US$150–400/h; a referência de
    LLM application engineering em boutique é £250–450/h — Winder.AI, 2026-06-24 — então
    US$150–400 é posicionamento de solo sem marca, não desconto de pânico).
  - Volume premissa: 1–2 em 30 dias.
  - **Faixa: R$4.000–18.000 (BR) ou US$1.500–8.000 (intl).**
- **Dependências e bloqueios:** requer que o comprador **já** use Claude Code ou Cursor —
  pool de prospects menor, especialmente em Londrina. O relatório de auditoria pertence ao
  cliente e é confidencial; qualquer uso como case exige autorização escrita.

---

#### R3 — Workshop com o conteúdo já escrito

- **Ativo:** B1 + B2 + `CLAUDE.md` (a tabela de router é o roteiro da aula) + A5.
- **Modelo:** workshop de meio dia, taxa fechada por turma.
- **Esforço:** 8–10h para virar `docs/ADOPTION.md` + `docs/START.md` em slides + 4h de
  entrega = 12–14h. Cabe.
- **Preço e aritmética:**
  - EUA/intl: workshop on-site custom **US$2.500–5.000 por time**; full-day
    role-specific **US$5.000 para até 12 pessoas** (TightSlice, 2026-07-01); busca
    complementar dá half-day US$3.000–8.000 até ~25 pessoas.
  - Brasil: **UNKNOWN** — nenhuma tabela publicada encontrada em 3 buscas (ohub, Hashtag
    Treinamentos, BT Company, Instituto Minere, KPMG BS: todas "sob consulta"). Premissa
    declarada: 35–50% do valor US, derivada da razão de hora BR/EUA da index.dev
    (US$30–55 vs US$95–110). Isso dá **R$4.700–13.500 por turma fechada** a
    US$2.500–5.000 × 35–50% × 5,40. **Trate como estimativa com premissa, não como preço
    de mercado.**
  - Volume premissa: 1 turma em 30 dias.
  - **Faixa: R$4.700–13.500 (BR, premissa) ou US$2.500–5.000 (intl, com fonte).**
- **Dependências:** precisa de um comprador corporativo com orçamento de treinamento —
  ciclo de compra tipicamente mais longo que 30 dias no Brasil. É por isso que não está no
  top 3.

---

#### R4 — Template licenciado / acesso pago ao pacote

- **Ativo:** A5 + `CLAUDE.md` + `rules/` + `skills/` + `agents/` + C3 + C4 + C6 +
  `.claude-plugin/` v1.2.0.
- **Modelo:** template licenciado (compra única) ou acesso pago.
- **Esforço:** 6–10h — a maior parte não é empacotar, é **limpar**: `spesia` aparece em
  13 linhas de 3 arquivos rastreados, incluindo um caminho de filesystem local
  (`docs/specs/2026-06-19-project-layout-standard-plan.md:594,607,617`;
  `docs/specs/2026-06-19-project-layout-standard-design.md:12,164-168`;
  `docs/specs/2026-06-19-cursor-adapter-design.md:17`).
- **Preço e aritmética:**
  - Setups documentados de Claude Code vendem a **US$27–97** (Medium, abr/2026);
    boilerplates de dev a US$49–249, com top sellers em US$1.500–3.500/mês (Jake's
    Insights, 2026-04-26). Taxa Gumroad: 10% + ~2,9% + US$0,30.
  - A mesma fonte diz que 5–15 cópias no primeiro mês pressupõem "**qualquer tipo de
    audiência existente**". **Você não tem audiência medida** — tem 6 seguidores no
    GitHub (brief §4). Então a aritmética honesta é: US$97 × **0–10 cópias** = **US$0–970
    bruto**, ~US$0–845 líquido depois das taxas.
  - **Esta rota tem como mecanismo "vender para a minha audiência", e a audiência é
    UNKNOWN além de 6 seguidores. Declarado explicitamente, como exige o brief.**
- **Conflito estrutural que você precisa ver:** o movimento que resolve o canal fechado
  (tornar o repositório público) é o mesmo que destrói a escassez desta rota — e sob **MIT
  já declarado em `LICENSE`**, qualquer pessoa que receba uma cópia pode redistribuí-la e
  revendê-la. Ou seja: o código nunca vai ser o fosso. Isso não é argumento contra
  publicar; é argumento para que o preço fique nos **serviços** (R1, R2, R7), não no
  arquivo.

---

#### R5 — Artefato patrocinado / escrita técnica paga sobre o conhecimento do Cursor

- **Ativo:** A2 (`docs/specs/2026-06-19-cursor-adapter-design.md:29-53`) + A1 + A3.
- **Modelo:** artigo pago / artefato patrocinado.
- **Esforço:** 6–8h por peça.
- **Preço e aritmética:** documentação de API/dev **US$0,20–0,40/palavra**; technical
  writer sênior ~US$105/h, topo US$173/h (goLance, 2026 — snippet). Peça de 1.800
  palavras = **US$360–720**. Volume premissa 1–2 em 30 dias = **US$360–1.440**.
- **Dependências:** exige uma publicação que pague e um pitch aceito. Nenhuma relação
  editorial está documentada no repositório — é prospecção fria. Alto diferencial, baixa
  previsibilidade de prazo.

---

#### R6 — Retainer de padrões de engenharia

- **Ativo:** todo o corpo de `rules/` + C1 + B4 (o ciclo de registro é o que se opera
  mensalmente).
- **Modelo:** retainer mensal.
- **Esforço:** 8–12h/mês.
- **Preço:** retainer de operação/evolução de IA no Brasil **R$5.000–20.000/mês**
  (Waxi, 2026-06-28); advisory leve de fractional CTO US$4.000–8.000/mês (busca, 2026);
  piso brasileiro de mentoria citado em "abaixo de R$1.500/mês é difícil sustentar"
  (Outsider School — **sem data verificável**, trate como fraco). Solo, primeiro contrato:
  **R$2.500–6.000/mês** ou **US$800–2.500/mês**.
- **Por que não é rota de 30 dias:** retainer é o **follow-on** de R1 ou R2, não a porta de
  entrada. Ninguém assina mensalidade com quem ainda não entregou nada. Registre como o
  destino, não como o primeiro passo.

---

#### R7 — Serviço de documentação de sistema legado, em português

- **Ativo:** B5 (`patterns/1-Analisys`, 51 linhas em PT-BR) +
  `agents/architecture-analyst.md` (120) + `patterns/2-Interview-brainstorm.md` +
  `/analisy-architecture` e `/talk-about-the-system` (`commands/`).
- **Modelo:** serviço de escopo fechado, preço fixo por sistema. Entregável:
  "Arquitetura do Sistema" + "Objetivo do Sistema" + `README.md` por módulo, com
  inferências marcadas como hipótese e módulos órfãos / acoplamentos / violações
  arquiteturais identificados — exatamente o que `patterns/1-Analisys` já especifica.
- **Esforço:** 10–16h por sistema de até ~15 módulos. Duas entregas por mês cabem nas 20h+.
- **Preço e aritmética:**
  - Brasil: 13h × R$300–700/h efetiva = **R$4.000–9.000** por sistema. Referência de piso:
    audit estático de código US$5.000–8.000 (DevCom, 2026-02-18) é entrega maior e mais
    caro; a banda de diagnóstico brasileira R$10.000–40.000 (Waxi, 2026-06-28) é escopo
    de 3–6 semanas. Posicionar em **R$4.500 (sistema pequeno) a R$9.000 (sistema com
    integrações)** fica claramente abaixo de ambos — que é onde um primeiro fornecedor sem
    case deve estar.
  - Internacional remoto: **US$1.200–3.000** por sistema (13h × US$90–230/h; o day-rate
    citado por consultfees, US$1.500–5.000/dia, mostra que 2 dias a US$1.500 é o piso
    conservador da faixa).
  - Volume premissa: 1–2 em 30 dias.
  - **Faixa: R$4.500–18.000 (BR) ou US$1.200–6.000 (intl).**
- **Por que esta rota é estruturalmente diferente das outras seis:**
  1. **Não exige que o comprador use Claude Code, Cursor, ou adote nada.** Ele compra um
     documento. Você usa suas ferramentas por baixo — é problema seu, não dele.
  2. **Não exige repositório público** — o canal fechado (brief §3) é irrelevante aqui.
  3. **Não exige audiência** — é venda 1:1 para prospect nomeado.
  4. **Já está em português**, e a dor ("ninguém sabe como esse sistema funciona, o cara
     que escreveu saiu") é universal e reconhecida por um gestor não-técnico em uma frase.
  5. É a menor superfície de conflito com o emprego: você produz **documentação sobre o
     sistema do cliente**, não altera o sistema dele e não entrega código seu — o que
     reduz (não elimina) a colisão com cláusulas de PI. UNKNOWN #1 continua valendo.
- **Bloqueio:** o cliente lhe dá acesso ao código-fonte dele. Isso exige NDA e o hábito de
  nunca reciclar trechos de código de cliente em `skills/` — precedente já registrado no
  repositório: `nestjs-patterns` absorveu material de terceiro (UNKNOWN #7).

---

#### Rotas CORTADAS (violam a regra dura: exigiriam construir antes de faturar)

- Curso gravado / cohort / SaaS / dashboard hospedado / "EngineOS Cloud" — todos exigem
  produto novo. Fora.
- **GitHub Sponsors / tier de apoio**: exige repositório público **e** audiência.
  `<12%` dos devs de open source ganham qualquer receita com isso (busca, 2026); ~40% do
  funding vem de organizações e cada patrocínio organizacional vale ~15× o individual
  (GitHub Blog, 2026-07-20) — ou seja, o dinheiro vem de empresas que dependem do seu
  código, e nenhuma depende do seu código hoje. Com 6 seguidores isto é jogada de
  reputação de 6–12 meses, **não rota de receita de 30 dias**. Registrado, não recomendado.
- Vender o pacote **antes** de limpar as 13 referências a `spesia` (R4): cortado até a
  limpeza, independente de preço.

---

### STEP 3 — Ranking (velocidade de retorno × esforço de execução)

| # | Rota | Esforço | Faixa 30d (BR) | Por que nesta posição — dado o **seu** contexto |
|---|---|---|---|---|
| **1** | **R7 — documentação de legado em PT-BR** | 10–16h | R$4.500–18.000 | Única rota que não é bloqueada por **nenhuma** das suas três restrições reais: canal fechado, audiência UNKNOWN, e risco de PI do emprego. Vende 1:1, em português, para uma dor que não precisa de tradução técnica. |
| **2** | **R2 — auditoria paga de governança** | 8–12h | R$4.000–18.000 | Maior preço por hora do inventário e produz um artefato escrito que se torna seu primeiro case. Fica em 2º porque o comprador precisa **já** usar Claude Code/Cursor — pool menor, e você não tem canal para encontrá-lo. |
| **3** | **R1 — instalar/adotar em um time** | 14–20h | R$6.000–24.000 | Maior ticket dos três, mas o ciclo de fechamento é mais longo e o comprador natural é o time de 2–10 pessoas do PRD, potencialmente o do seu empregador — a maior exposição contratual do inventário (UNKNOWN #1 + #4). |

**Onde começar: R7. A razão é propriedade da sua situação, não do tamanho da receita.**

Seu gargalo não é preço nem qualidade do ativo — é que **você não tem um canal**. O repo é
privado, os dois caminhos de instalação do `README.md` retornam 404 para qualquer terceiro
(brief §3), e a audiência medida é 6 seguidores. Qualquer rota cujo primeiro passo seja
"as pessoas me encontram" está morta este mês. R7 é a única que começa com **você**
encontrando cinco pessoas, e cuja entrega não exige que elas adotem nada seu.

Somado a isso: você tem emprego, 20h+/semana e um histórico de 7 semanas cuja velocidade
**já caiu pela metade uma vez** (brief §2). Isso desqualifica rotas com rampa longa e
qualifica a que fecha em uma semana de trabalho. E R7 é a de menor superfície de colisão
com o emprego, porque o entregável é documentação do sistema **do cliente** — o que reduz,
sem eliminar, a exposição do UNKNOWN #1.

Se a sua urgência for **reputação** e não caixa, a ordem muda: publicar o repositório vira
o primeiro passo e este ranking deve ser rerodado. Mas isso é decisão do modo *positioning*,
e você não me disse que caixa não importa.

---

## The one action

**Até 2026-08-13 (14 dias), envie uma proposta única, de escopo e preço fechados, para
5 prospects nomeados da sua própria rede** (LinkedIn `ricardo-fagmer`, ex-colegas,
contatos de Londrina) oferecendo o entregável de `patterns/1-Analisys`:

> "Documentação de arquitetura do seu sistema em 7 dias: um documento de arquitetura, um
> documento de objetivo do sistema, e um README por módulo — com acoplamentos, módulos
> órfãos e riscos técnicos identificados, e toda inferência marcada como hipótese.
> **R$4.500** para um sistema de até 15 módulos. Pagamento na entrega."

Regras da ação, para ela permanecer **uma** ação: nenhuma linha de código nova, nenhuma
página de vendas, nenhum post público, nenhuma mudança no repositório. Cinco mensagens.
Antes de enviar a primeira, releia seu contrato de trabalho quanto a exclusividade e cessão
de PI (UNKNOWN #1) — e se houver qualquer ambiguidade, fale com um advogado, não comigo.

**Sinal observável de sucesso:** ≥1 das 5 mensagens responde perguntando escopo, prazo ou
preço até **2026-08-23**. Sucesso pleno: 1 contrato assinado a ≥R$3.000 até **2026-08-31**
— o que também produz seu primeiro número real de receita, encerrando o "zero estrutural"
do brief §6.

**Sinal de fracasso, igualmente informativo:** 0 respostas em 5. Isso não significa que o
preço está errado — significa que você não tem comprador alcançável, e o problema muda de
monetização para *positioning*. Nesse caso, pare de vender e vá tornar o repositório
público.

**Ação secundária de 5 minutos, não negociável e não substituível pela ação principal:**
`git add install.ps1` e commite. 293 linhas do único instalador Windows do projeto existem
apenas nesta máquina; é o único ativo do inventário que um `git clean` apaga.

---

## What would falsify this

1. **O contrato de trabalho contém cláusula de exclusividade ou cessão de PI cobrindo
   trabalho no mesmo campo.** Então R1, R2 e R7 são inválidas como desenhadas, o valor de
   30 dias cai para ~zero, e a análise inteira precisa ser rerodada como "publicar por
   reputação". Este é o falsificador mais provável e o mais barato de checar — leia o
   contrato antes de enviar as 5 mensagens.
2. **5 propostas → 0 respostas, e simultaneamente o repositório publicado ganha tração
   orgânica** (>50 estrelas ou >5 issues de terceiros na primeira semana). Então o valor
   está na distribuição, não em serviço 1:1, e o ranking se invertiria em favor de R4/R8.
3. **Um prospect diz que o entregável de R7 vale menos de R$1.500.** Então a âncora
   brasileira derivada de index.dev está errada para Londrina e todos os preços em BRL deste
   relatório precisam ser rebaixados — o que também mata R1 e R2 na forma atual.
4. **Existe uma audiência real e não declarada** (≥1.000 pessoas em qualquer canal que você
   controle). Então UNKNOWN #2 se resolve para cima, R4 sobe para o top 3, e a rota mais
   rápida deixa de ser 1:1.
5. **Alguém publica, antes de você, um pacote aberto e mantido que já entrega o adaptador
   Cursor com paridade de hooks.** Então A2 — o ativo de conhecimento com maior diferencial
   do inventário — perde o prêmio de escassez, e R5 deixa de ter valor de venda.
6. **`scripts/usage-report.sh` rodado sobre seus próprios transcripts produz um número de
   ganho defensável** (ex.: falhas pegas por hook por semana, com tendência). Então a
   Classe E deixa de ser hope, torna-se ativo, e passa a ser possível vender ROI — o que
   muda tanto o preço quanto o discurso de todas as sete rotas para cima.
