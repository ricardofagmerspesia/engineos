# Opportunity — EngineOS como produto

Date: 2026-07-30 · Mode: opportunity · Confidence: medium

> Não é consultoria financeira nem jurídica. São enquadramentos estratégicos baseados em
> fontes datadas e em arquivos deste repositório.

## Headline

A camada de *regras* que a EngineOS construiu já é commodity de primeira-parte (a Anthropic
enviou `.claude/rules/` com `paths:` em 2025-12-10, seis meses antes do primeiro commit deste
repo em 2026-06-11), mas em 2026-03-04 a Anthropic enviou o hook `InstructionsLoaded` e
**zero dos 2.283 plugins do catálogo comunitário oficial mencionam esse hook** — a evidência
de conformidade ("quais padrões governaram de fato esta alteração") é o único espaço vazio
que a competência já comprovada do dono alcança em 7 dias.

## Grounding

### Projeto (arquivos lidos neste repo)

- `CLAUDE.md:31-33` — o roteador declara que as linhas de stack/domínio são espelhadas
  deterministicamente pelo hook `PreToolUse` `hooks/route-before-change.sh`, cujo mapa
  canônico é `hooks/routing-map.sh`.
- `hooks/hooks.json:14-24` — `PreToolUse` com matcher `Edit|Write` → `route-before-change.sh`.
- `hooks/hooks.json:40-53` — gate `Stop` → `stop-verify.sh` + `record-verify.sh`.
- `hooks/routing-map.sh:1-6` — arquivo declarado autoritativo para roteamento por padrão de path.
- `.claude-plugin/plugin.json:5` — `"version": "1.2.0"`; `.claude-plugin/marketplace.json:12`
  — `"version": "1.0.0"`. **Deriva de versão entre os dois manifestos do mesmo plugin.**
- `.claude-plugin/plugin.json:10` — `repository` aponta para o repo privado (404 público,
  brief §3).
- `README.md:18` e `README.md:24-25` — os dois caminhos de instalação documentados
  (`git clone` SSH e `/plugin marketplace add ricardofagmer/...`), ambos inoperantes para
  terceiros (brief §3).
- Medido hoje: 13 arquivos `rules/*.md` = **492 linhas no total**; `CLAUDE.md` = **85 linhas**;
  **não existe `AGENTS.md`** na raiz; **não existe diretório `.claude/rules/`** (só
  `.claude/settings.local.json`).
- `.engineos/archived/2026/06/17` e `.../06/19` (pastas-dia) convivem com
  `.engineos/archived/2026/07/{docs,general,mobile}` (agrupamento por domínio) — confirma
  materialmente a deriva de convenção do brief §5.4.
- Os 6 hooks cobrem `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`
  (`hooks/hooks.json:1-56`). **`InstructionsLoaded` não é usado.**

### Web (fonte — título, publisher, data — o que provou)

1. **code.claude.com/docs/en/memory** (Anthropic, docs, acessado 2026-07-30) — "Claude Code
   reads `CLAUDE.md`, not `AGENTS.md`"; escopos de memória incluindo *managed policy*
   (`/Library/Application Support/ClaudeCode/CLAUDE.md`, `/etc/claude-code/CLAUDE.md`,
   `C:\Program Files\ClaudeCode\CLAUDE.md`) e a chave `claudeMd` em `managed-settings.json`;
   `.claude/rules/` com frontmatter `paths:`; e a dica explícita de usar o hook
   `InstructionsLoaded` "to log exactly which instruction files are loaded, when they load,
   and why".
2. **registry.npmjs.org/@anthropic-ai/claude-code** (npm registry, consultado 2026-07-30) —
   datas de publicação primárias: **v2.0.64 = 2025-12-10** (entrada de changelog "Added
   support for .claude/rules/"), **v2.1.69 = 2026-03-04** (entrada "Added `InstructionsLoaded`
   hook event that fires when CLAUDE.md or `.claude/rules/*.md` files are loaded into
   context"), **v2.1.33 = 2026-02-06** (agent teams research preview), **v2.1.178 =
   2026-06-15** (agent teams simplificado), **v2.1.219 = 2026-07-24** (Opus 5 default, 1M de
   contexto, fast mode a $10/$50 por Mtok).
3. **anthropics/claude-code issue #23478** (GitHub, criada 2026-02-05, **closed as not
   planned**) — regras com `paths:` só carregam em *Read*, não em *Write*; convenções de
   criação de arquivo são silenciosamente ignoradas; o workaround comunitário é um hook
   `PostToolUse`.
4. **anthropics/claude-code issue #6235** (GitHub, aberta 2025-08-21, **ainda aberta**, sem
   assignee) — pedido de suporte a AGENTS.md no Claude Code.
5. **code.claude.com/docs/en/plugins** (Anthropic, docs, acessado 2026-07-30) — existem duas
   marketplaces públicas: `claude-plugins-official` (curada, "There is no application
   process", inclusão "at Anthropic's discretion") e `claude-community`
   (`anthropics/claude-plugins-community`, onde submissões de terceiros aterrissam após
   revisão). Submissão por **autores individuais fora de org Team/Enterprise** via
   `platform.claude.com/plugins/submit`. `claude plugin validate ./your-plugin` roda a mesma
   checagem do pipeline; plugins aprovados são fixados num commit SHA e o catálogo público
   sincroniza **nightly**.
6. **code.claude.com/docs/en/plugin-marketplaces** + **support.claude.com art. 13837433**
   (acessados 2026-07-30) — para marketplace distribuída via *Organization settings >
   Plugins*: "The marketplace repository must be private or internal" / "public repos aren't
   allowed for organization marketplaces"; leitura via Claude GitHub App ou GHE App; exige
   plano Team/Enterprise e Cowork + Skills habilitados na org.
7. **anthropics/claude-plugins-community/.claude-plugin/marketplace.json** (medido
   diretamente em 2026-07-30) — **2.283 plugins**. Busca em nome+descrição: 193 mencionam
   `hook`; 30 mencionam audit trail/provenance/attestation; **0 mencionam
   `InstructionsLoaded`**. Concorrentes diretos já listados: `dod-guard` ("Definition of Done
   as an executable barrier for Claude Code. Stops AI agents from declaring tasks done…"),
   `agentops` ("Enterprise guardrails, delivery lifecycle… 7 security layers"), `kauri`
   ("Deterministic decision records for agents and humans"), `genesis-governance-claude`,
   `mo-es-governance`, `carryall-policy-enforcement`, `civic`, `memoriant-llm-gateway-skill`.
   Nenhuma entrada chamada `engineos`.
8. **github.com/anthropics/claude-plugins-official** (acessado 2026-07-30) — **32,9k stars**;
   aceita plugins externos em `/external_plugins`; diretório oficial lançado **2026-05-22**
   (TechTimes, 2026-05-25).
9. **Endor Labs, "Introducing Coding Agent Governance: Using Hooks to Bring Visibility to the
   ADLC"**, Robert Haynes, publicado **2026-05-12**, atualizado **2026-07-22** — `endorctl
   ai-audit claudecode` ligado a seis eventos de hook (SessionStart, UserPromptSubmit,
   PreToolUse, PostToolUse, PostToolUseFailure, Stop), com política determinística e trilha
   forense em SIEM: "a forensic record of what the agent did, on whose machine, against which
   repo".
10. **Torii, "8 Tools to Track and Govern Claude Code Extensions in 2026"**, publicado
    **2026-06-16** — oito fornecedores (Torii, Zenity, Pillar Security, Reco, Prompt Security,
    Lasso Security, Nudge Security, Wing Security). Todos governam **ações, identidade e
    dados** (MCP allowlists, injection, OAuth, DLP, shadow-LLM). Nenhum governa conformidade a
    padrões de engenharia.
11. **Anthropic Compliance API** (platform.claude.com/docs/en/manage-claude/compliance-api) +
    **Help Net Security, "Anthropic adds 28 security and compliance integrations for Claude",
    2026-05-25** — release em 2026-05-21; logs por evento de prompt/resposta/anexo para
    SIEM/DLP/identidade.
12. **Council of the EU, "Artificial Intelligence: Council gives final green light to simplify
    and streamline rules"**, consilium.europa.eu, **2026-06-29** — Digital Omnibus on AI;
    Parlamento adotou 2026-06-16; ato assinado 2026-07-08; adia obrigações de alto risco.
13. **artificialintelligenceact.eu/implementation-timeline** (acessado 2026-07-30) — em
    **2026-08-02** o restante do AI Act passa a aplicar-se **exceto o Art. 6(1)**, que vai para
    **2027-08-02**.
14. **Presidio Achieves ISO/IEC 42001 Certification**, GlobeNewswire, **2026-07-15** —
    certificação enquadrada como habilitador comercial: "Supports vendor evaluations and
    security reviews as more businesses add AI governance to their buying criteria".
15. **Linux Foundation press release** + **TechCrunch**, ambos **2025-12-09** — formação da
    Agentic AI Foundation (AAIF) com MCP (Anthropic), AGENTS.md (OpenAI) e goose (Block).
    **agents.md** (acessado 2026-07-30) — 60.000+ repos, 20+ ferramentas.
16. **github.com/buildermethods/agent-os** + **buildermethods.com/agent-os** (acessados
    2026-07-30) — 5,1k stars, 812 forks, v3, gratuito e open source, "injecting your codebase
    standards"; funciona com Claude Code, Cursor, Antigravity. **Sem hooks, sem subagents, sem
    audit/compliance.** Monetização do autor é por cursos pagos e membership, não pelo OSS.
17. **Anthropic, "Technical Specialist, Claude Code"** (job-boards.greenhouse.io/anthropic/
    jobs/5198999008, acessado 2026-07-30) — Londres, **£180.000–£225.000**; responsabilidade
    explícita de dirigir adoção de "sub-agents, skills, hooks, MCP, headless mode, managed
    settings" e construir "Claude Code plugins, agents, and MCP integrations as customer
    deliverables".
18. **news.cognizant.com, 2026-07-27** — Cognizant/Anthropic ampliam parceria; Claude Code
    embutido no módulo **Spec-Driven Development** do Flowsource™; 30.000+ colaboradores
    treinados em Claude.
19. **2pc.com.br** (acessado 2026-07-30) — boutique brasileira (São Paulo/Miami, PT+EN) que já
    vende "Spec-Driven Development from scratch — foundation, constitution, PRDs and ADRs as
    persistent context for Claude Code"; alega 80+ empresas com sistemas críticos.
20. **Alura, "Engenharia de software na era da IA: context engineering, workflows e controle de
    custo"** (acessado 2026-07-30, **atualizado 2026-07-24**) — 10h, em português, cobre janela
    de contexto, sub-agents/times, caching. **Não cobre** CLAUDE.md, AGENTS.md, rules, hooks ou
    padrões de time.
21. **PL 2338/2023** (Senado, telesintese.com.br) — aprovado no Senado em **2024-12-10**;
    relatório/votação na Câmara previstos para 2026-05-19/2026-05-27; senador Eduardo Gomes
    afirma que pode ficar para **2027**. **Não é lei em 2026-07-30.**

### UNKNOWN (e como mudaria a conclusão)

- **Número primário de certificados ISO/IEC 42001 no mundo.** Só encontrei fontes secundárias
  ("350+ em abril de 2026"). Não há pesquisa ISO primária citável. → Se o número real for muito
  menor, o Movimento 3 perde força de "requisito comprado" e vira "requisito anunciado", e a
  urgência da evidência de conformidade cai de 2 para 4+ trimestres.
- **Data de publicação da vaga da Anthropic** (job board não expõe). → Se for antiga (2025), o
  sinal de contratação é mais fraco do que aparenta.
- **Se algum dos 8 fornecedores do artigo Torii já entrega conformidade a padrões de
  engenharia** (auditei as descrições, não a documentação completa dos 8 produtos). → Se algum
  já entrega, a janela do Movimento 1 está fechada e a ação recomendada perde sentido.
- **Se o time de 2–10 pessoas do `docs/PRD.md:4` existe de fato na Spesia** (brief §6). → É a
  variável que decide se o sinal forte de sucesso ("um receipt gerado em máquina que não é a
  dele") é alcançável em 14 dias ou não.
- **Audiência controlada pelo dono fora do GitHub** (brief §6). Só 6 followers medidos. → Se
  existir audiência, a submissão ao catálogo deixa de ser o único canal; se não existir, ela é
  o único canal e o sinal deve ser medido lá.
- **Cláusulas de IP/moonlighting do emprego atual** (brief §6). → Torna público um repo que
  hoje é privado; isso é decisão contratual dele, não recomendação minha, e é pré-condição
  bloqueante da ação.
- **Taxa real de adoção de hooks entre times** — só achei afirmações qualitativas, nenhuma
  survey com número. → Se hooks já forem padrão de mercado, o diferencial encolhe.

---

## Analysis

### STEP 1 — Três movimentos emergentes

#### Movimento 1 — O hook virou o primitivo de auditoria de agentes, e a metade de "conformidade a padrões" está desocupada

**O que está mudando (fato datado).** Fornecedores comerciais de segurança passaram a
instrumentar o Claude Code por hooks, não por prompt. A Endor Labs publicou em **2026-05-12**
(atualizado **2026-07-22**) a ligação de `endorctl ai-audit claudecode` a seis eventos de hook,
transformando o agente em "governed systems with deterministic policy, centralized audit, and
defense in depth", com streaming para SIEM. Em **2026-06-16** já existia um artigo mapeando
**oito** fornecedores desse nicho (Torii). Todos os oito governam **o que o agente fez** —
comandos shell, arquivos sensíveis, allowlists de MCP, escopos OAuth, DLP. Nenhum governa **com
quais padrões o agente foi instruído**.

**Por que AGORA (gatilho específico, duas partes no mesmo trimestre).**
1. Em **2026-03-04** (v2.1.69, data de publicação no npm) a Anthropic enviou o evento
   `InstructionsLoaded`, que dispara quando `CLAUDE.md` ou `.claude/rules/*.md` entram no
   contexto. Antes disso, "o agente seguiu os padrões do time" era uma afirmação
   **infalsificável**; depois disso, é um evento de log.
2. Em **2026-02-05** foi aberta a issue #23478 e ela foi **fechada como *not planned***: regras
   com `paths:` carregam em *Read* e **não** em *Write*. A Anthropic deu o primitivo de
   observabilidade e, no mesmo trimestre, declinou explicitamente fechar a lacuna de
   *enforcement* na criação de arquivo — o que significa que um hook `PreToolUse` com matcher
   `Edit|Write` não é redundância com o produto nativo, é o suplemento que a própria Anthropic
   disse que não vai construir.

**A janela que abre.** Emitir, por alteração, um artefato legível por máquina que responda
"quais regras foram carregadas, quais gates rodaram, o que foi produzido" — exatamente a
pergunta que um questionário de procurement faz (ver Movimento 3) e que nenhum dos oito
fornecedores responde. Isso não era possível 12 meses atrás porque o evento não existia.
**Prazo de fechamento: ~2 trimestres.** A Endor Labs já tem os seis eventos de hook plumbados e
o pipeline de SIEM; acrescentar "as regras exigidas foram carregadas?" é uma feature sobre
infraestrutura existente, não um produto novo.

**Falsificador.** Qualquer um dos oito fornecedores (ou a Anthropic, via Claude Code Analytics
API) publicar relatório de *aderência a instruções* — não só de política de segurança — antes
de ~Q1/2027. Ou a issue #23478 ser reaberta e implementada, tornando o gate `Edit|Write`
nativo.

---

#### Movimento 2 — A distribuição de configuração de agente bifurcou: o canal público saturou e o canal com valor passou a *exigir* repositório privado

**O que está mudando (fato datado e medido).** Medi o catálogo comunitário oficial em
**2026-07-30**: `anthropics/claude-plugins-community/.claude-plugin/marketplace.json` tem
**2.283 plugins**. Há analogia direta para quase todo componente da EngineOS já listada —
`dod-guard` para o gate de "done", `kauri` para decision records, `agentops` para guardrails de
ciclo de vida, `genesis-governance-claude`/`mo-es-governance` para "constitution". Em paralelo,
a documentação da Anthropic (acessada 2026-07-30) estabelece que uma marketplace distribuída
via *Organization settings > Plugins* **tem de ser privada ou interna**: "public repos aren't
allowed for organization marketplaces", lida via Claude GitHub App, em plano Team/Enterprise.

**Por que AGORA (default invertido, em um único trimestre).** Em **2026-05-22** a Anthropic
lançou o diretório oficial de primeira parte (`anthropics/claude-plugins-official`, **32,9k
stars** hoje), explicitamente **sem processo de aplicação** — "Anthropic decides which plugins
to include at its discretion". No mesmo período consolidou-se o terceiro canal, o de
organização, com o requisito **oposto** ao do canal público. Ou seja: desde ~maio/2026 existem
três canais legítimos com regras de visibilidade incompatíveis — o comunitário (público,
saturado, revisão automatizada, sync nightly), o oficial (curado, sem porta de entrada) e o
corporativo (**privado obrigatório**, com admin sync).

**A janela que abre.** O achado que reenquadra o brief §3: **ser privado não é o defeito, é o
requisito do único canal onde o artefato ainda tem preço.** O que 12 meses atrás era "publique
no GitHub e espere stars" hoje se divide em duas apostas diferentes — reputação (canal público,
já saturado) e receita (canal privado de organização, com gate de plano e de admin). Escolher
os dois ao mesmo tempo é impossível para o mesmo repositório de marketplace. **Prazo: 1–2
trimestres** até que o canal comunitário passe de saturado a ruidoso o suficiente para que
listagem não signifique nada (já está próximo disso a 2.283 entradas).

**Falsificador.** A Anthropic passar a permitir repositórios públicos em marketplaces de
organização (unificando os canais), ou o catálogo comunitário ganhar curadoria/ranking real
que devolva valor de descoberta à listagem pública.

---

#### Movimento 3 — O prazo regulatório que todos precificaram foi adiado; o comprador real virou o questionário de procurement

**O que está mudando (fato datado).** O Digital Omnibus on AI foi adotado pelo Parlamento em
**2026-06-16**, recebeu luz verde final do Conselho em **2026-06-29** e o ato foi assinado em
**2026-07-08**, adiando obrigações de alto risco. O cronograma oficial (acessado 2026-07-30)
registra que em **2026-08-02** aplica-se o restante do AI Act **exceto o Art. 6(1)**, empurrado
para **2027-08-02**. No Brasil, o PL 2338/2023 foi aprovado no Senado em **2024-12-10** e segue
sem votação final na Câmara — relatório/votação previstos para maio de 2026 não se concluíram e
há declaração de que pode ficar para **2027**.

**Por que AGORA (dois eventos datados apontando em direções opostas em 7 dias).** Em
**2026-07-08** a UE assinou a remoção do prazo de alto risco. Em **2026-07-15** um fornecedor
publicou certificação ISO/IEC 42001 justificada como habilitador comercial: "Supports vendor
evaluations and security reviews **as more businesses add AI governance to their buying
criteria**". E em **2026-05-21** a própria Anthropic lançou a Compliance API com 28 integrações
de segurança/compliance. A pressão de compra **migrou do regulador para o cliente** — e o resto
do mercado continua vendendo urgência com base num prazo que deixou de existir.

**A janela que abre.** Vender evidência para o **questionário de fornecedor**, que está vivo
hoje, em vez de para uma deadline que agora é 2027-08-02. Importante: a Compliance API loga
**prompt, resposta e anexo** — atividade de uso. Ela **não** loga qual padrão de engenharia
governou a alteração. Essa é a lacuna concreta e datada. **Prazo: até que checklists de auditoria
ISO 42001 padronizem o que conta como "controle de SDLC assistido por IA"** — os organismos
certificadores estão escalando agora, e a partir daí a resposta certa passa a ser prescrita e
comoditizada. Estimativa: 2–4 trimestres, com a ressalva do UNKNOWN sobre o número real de
certificados.

**Falsificador.** A UE reinstaurar a data de agosto de 2026 para alto risco; ou questionários de
segurança corporativos pararem de perguntar sobre trilha de auditoria de código escrito por IA;
ou a Anthropic estender a Compliance API para cobrir aderência a instruções (o que resolveria o
problema na primeira parte).

---

#### Cortados por serem já mainstream (declarados, conforme a regra do modo)

- **"AGENTS.md vs CLAUDE.md / convergência entre ferramentas".** Fato real e verificado (docs da
  Anthropic, 2026-07-30: "Claude Code reads `CLAUDE.md`, not `AGENTS.md`"; issue #6235 aberta
  desde 2025-08-21; AAIF formada em 2025-12-09; 60.000+ repos). **Mas é literatura de blog
  saturada** — a busca devolve dezenas de guias "AGENTS.md 2026" de fevereiro a maio de 2026.
  Sem vantagem de timing. Cortado.
- **"Context engineering como disciplina nova".** Cortado: já tem definição da Gartner, dados
  salariais no ZipRecruiter (julho/2026), listicles de cargos e — decisivo para o caso
  brasileiro — **curso de 10h na Alura em português atualizado em 2026-07-24**. É pauta de
  keynote, não janela.
- **"O Brasil está atrasado, existe gap de idioma a explorar".** Cortado **porque a evidência o
  falsifica**: a Alura já publicou o conteúdo em português (2026-07-24); a **2pc.com.br** (São
  Paulo/Miami) já vende exatamente "Spec-Driven Development from scratch — foundation,
  constitution, PRDs and ADRs as persistent context for Claude Code"; e a Cognizant embutiu
  Claude Code no módulo Spec-Driven Development do Flowsource em **2026-07-27** com 30.000+
  pessoas treinadas. O mercado brasileiro não é um espaço vazio — é um espaço já ocupado por
  quem tem marca e vendedores. (O brief §6 pedia pesquisa desse ponto; o resultado é negativo, e
  registrar isso vale mais que inventar um movimento.)

Não cortei um quarto candidato para chegar a três: os três acima são os que sobreviveram à
exigência de gatilho datado.

---

### STEP 2 — Cruzar a competência comprovada com os movimentos

**A competência comprovada (por código enviado, não por autodescrição).** O que este repo prova
que o dono sabe fazer não é escrever regras — são 492 linhas de prosa em 13 arquivos
(`rules/*.md`), copiáveis numa tarde. O que ele prova é **construir uma camada de enforcement
que falha fechada em cima do ciclo de vida do agente**: seis hooks distribuídos por quatro
eventos (`hooks/hooks.json:1-56`), um mapa determinístico de path→domínio em bash declarado
autoritativo (`hooks/routing-map.sh:1-6`, `CLAUDE.md:31-33`), e um gate `Stop` duplo que recusa
o encerramento da sessão até existir registro de mudança (`hooks/hooks.json:40-53`) — com **22
registros arquivados** como prova de que o ciclo rodou de verdade (brief §2). Comparação direta:
**Agent OS** (5,1k stars, v3, gratuito) faz injeção de padrões e shaping de spec e **não tem
hooks, subagents nem audit**; os oito fornecedores do artigo Torii têm hooks e audit e **não
têm padrões de engenharia**.

**A ÚNICA oportunidade com maior vantagem sobre um entrante posterior.**
Cruzando Movimento 1 (o hook é o primitivo de auditoria; a metade de conformidade está vazia)
com Movimento 3 (o comprador é o questionário, não o regulador):

> **Ser a camada de *evidência de conformidade* do Claude Code: um `InstructionsLoaded` →
> "receipt" por alteração, que registra quais arquivos de instrução entraram no contexto, quais
> gates rodaram e com que resultado, reconciliado com o registro de mudança que o gate `Stop`
> já exige.**

Por que é aqui que ele tem a maior vantagem, e não em outro lugar:
- **A infraestrutura já existe e é a parte difícil.** O gate `Stop` que recusa "done" sem
  registro (`hooks/hooks.json:40-53`) e o roteamento `PreToolUse` em `Edit|Write`
  (`hooks/hooks.json:14-24`) são exatamente o esqueleto de um receipt. Falta o 7º hook e a
  serialização — não falta o sistema.
- **O `Edit|Write` cobre uma lacuna que a Anthropic declarou que não vai fechar.** Issue #23478,
  *closed as not planned* (aberta 2026-02-05): regras `paths:` não carregam em Write. O matcher
  de `hooks/hooks.json:16` cobre Write. Isso é durável por decisão do fornecedor, não por sorte.
- **O slot está literalmente vazio.** **0 de 2.283** descrições do catálogo comunitário
  mencionam `InstructionsLoaded` (medido 2026-07-30), enquanto 193 já mencionam `hook` e 30 já
  mencionam audit trail — ou seja, o espaço adjacente está lotado e este ponto específico não
  está.

**Por que essa vantagem decai — e em quanto tempo.**

| Camada do ativo | O que um copiador replica | Em quanto tempo |
|---|---|---|
| 13 `rules/*.md` (492 linhas), tabela do roteador (`CLAUDE.md`, 85 linhas), 33 slash commands gerados | Tudo. É prosa e geração mecânica. E `.claude/rules/` nativo (enviado **2025-12-10**, v2.0.64) já substitui metade da função — seis meses **antes** do primeiro commit deste repo (2026-06-11) | **Dias** |
| 18 agentes + 8 skills | Tudo. O ecossistema já lista milhares de skills e centenas de agentes; `agentops`, `dod-guard` e `kauri` cobrem funções equivalentes | **2–6 semanas** |
| O hook de receipt em si | Tudo, uma vez visto. São ~100 linhas de shell sobre um evento documentado | **Um fim de semana**, depois que alguém publica a ideia |
| **A forma do ciclo que sobrevive a um time real** — quais gates falham fechados vs apenas avisam, o que um registro precisa conter para ser auditável, onde estão os falsos positivos | Não replica lendo. Só se aprende rodando | **3–6 meses, e só com uso real** |

A conclusão desconfortável: **a única camada durável é a única para a qual ele tem a menor
evidência.** O `docs/PRD.md:4` escopa a EngineOS para um time de 2–10 pessoas, e o histórico
mostra um autor único com PRs auto-mergeados (brief §2 e §5.1). Um concorrente com **um** time
real de 8 pessoas chega lá em um trimestre. E a Endor Labs, que já tem os seis eventos e o SIEM
desde 2026-05-12, chega em menos. **Relógio de decaimento: ~2 trimestres.** Nada nesse repo
alonga esse relógio — só uso por um segundo humano alonga.

---

## The one action

**Ação (uma), prazo 2026-08-06 (7 dias):** empacotar o *conformance receipt* como plugin de
propósito único e submetê-lo ao catálogo comunitário oficial pelo formulário de autor
individual.

Concretamente, e apenas isso:

1. Adicionar o 7º hook em `hooks/hooks.json`: evento `InstructionsLoaded` → script que grava
   `.engineos/receipts/<YYYY-MM-DD>-<change-id>.json` com os arquivos de instrução carregados,
   timestamp, commit SHA e repo.
2. Estender `hooks/record-verify.sh` para reconciliar o receipt com o registro de mudança que o
   gate `Stop` já exige — se o registro cita uma spec e o receipt não mostra a regra de domínio
   correspondente carregada, o gate falha.
3. Corrigir as duas derivas que um validador vai pegar: a versão divergente
   (`.claude-plugin/plugin.json:5` = 1.2.0 vs `.claude-plugin/marketplace.json:12` = 1.0.0) e a
   seção de instalação do `README.md:18,24-25`, que documenta dois canais mortos.
4. Rodar `claude plugin validate ./ --strict` (mesma checagem do pipeline de revisão) até passar.
5. Submeter em `platform.claude.com/plugins/submit` — a rota explicitamente aberta a autores
   individuais fora de org Team/Enterprise — com **uma única** frase de descrição: emitir
   evidência por alteração de quais padrões governaram o código escrito pelo agente.

Por que esta e não outra: é a única que usa o que já existe (6 hooks + 22 registros), ataca o
slot medido como vazio (0/2.283), depende de um evento de primeira parte já enviado
(2026-03-04), e é blindada pela decisão *not planned* da issue #23478. Submeter a EngineOS
**inteira** ao catálogo seria entrar como o 2.284º plugin genérico ao lado de `dod-guard` e
`agentops` — distribuição de commodity, não ocupação de espaço.

**Pré-condição bloqueante (não é conselho jurídico):** o passo 5 exige repositório legível pelo
pipeline (plugins aprovados são fixados num commit SHA). Os termos de IP/moonlighting do emprego
atual são UNKNOWN (brief §6) e precisam ser resolvidos por ele antes do passo 4 — se a resposta
for negativa, a mesma ação vira a rota privada de organização do Movimento 2 (marketplace em
repo **privado**, via Claude GitHub App, plano Team/Enterprise), e o sinal de sucesso muda junto.

**Sinal observável de que funcionou.** Um único, verificável por terceiros: até **2026-08-20**,
o nome do plugin aparece em
`https://github.com/anthropics/claude-plugins-community/blob/main/.claude-plugin/marketplace.json`
(o catálogo público sincroniza *nightly*; hoje, 2026-07-30, o arquivo tem 2.283 entradas e
nenhuma chamada `engineos`). Uma rejeição documentada com critérios também conta como sinal —
informa o que falta. **Silêncio, não.**

Sinal mais forte, se o time do `docs/PRD.md:4` existir de fato (UNKNOWN, brief §6): um arquivo
de receipt gerado por uma sessão que ele não rodou. Esse é o primeiro número diferente de zero
estrutural que este projeto pode produzir.

Se nem um nem outro ocorrer até 2026-08-20, a restrição **não** é distribuição — é demanda. Nesse
caso o próximo movimento é entrevistar compradores, não construir mais superfície (e vale notar
que o trabalho enviado em julho já foi todo de *adicionar superfície*, brief §2).

---

## What would falsify this

Qualquer uma destas observações invalida a análise e exige rerodá-la:

1. **Uma busca em `anthropics/claude-plugins-community/.claude-plugin/marketplace.json` retornar
   plugins que usam `InstructionsLoaded` para evidência de conformidade.** Medi 0 de 2.283 em
   2026-07-30 sobre nome+descrição; se o hook estiver em uso sem aparecer na descrição, o slot
   não está vazio e a tese central cai.
2. **Endor Labs, Zenity, Pillar, Prompt Security ou qualquer um dos oito publicar relatório de
   aderência a instruções/padrões** (não só política de segurança). A Endor já tem os seis
   eventos de hook desde 2026-05-12; isso fecharia a janela do Movimento 1 antes de ela ser
   ocupada.
3. **A Anthropic reabrir e implementar a issue #23478** (regras `paths:` disparando em Write),
   ou enviar aderência a instruções na Claude Code Analytics API. Hoje #23478 está *closed as
   not planned* — é essa decisão que sustenta a durabilidade do gate `Edit|Write`.
4. **A UE reinstaurar 2026-08-02 para obrigações de alto risco**, revertendo o ato assinado em
   2026-07-08. Isso devolveria a urgência ao regulador e tornaria o enquadramento
   "procurement, não regulação" do Movimento 3 errado.
5. **O número primário de certificados ISO/IEC 42001 se revelar muito abaixo das centenas.** É o
   UNKNOWN mais carregado do relatório; se a base certificada for marginal, "governança comprada"
   é narrativa de fornecedor e o horizonte da oportunidade dobra.
6. **A Anthropic permitir repositórios públicos em marketplaces de organização.** Isso unificaria
   os canais e destruiria a bifurcação que é o Movimento 2 inteiro.
7. **Um segundo humano usar a EngineOS e o ciclo de governança quebrar na primeira semana.** Seria
   a falsificação mais valiosa de todas: significaria que a camada que chamei de durável (a forma
   do ciclo testada em uso) ainda não existe — apenas parece existir por ter rodado sempre na
   mesma máquina, com o mesmo autor, com as derivas de instalação e de docs que o brief §5.5
   documentou.
