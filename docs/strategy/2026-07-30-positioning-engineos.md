# Positioning — autoridade percebida em torno do EngineOS

**Modo:** positioning · **Data:** 2026-07-30 · **Sujeito:** Ricardo Fagmer (Londrina/BR, 15+ anos JS/TS/Node/Nest, empregado, 20+ h/semana disponíveis)
**Base de evidência congelada:** `docs/strategy/2026-07-30-grounding-brief.md`
**Playbook:** `skills/strategy/references/04-positioning.md`

---

## Headline

O perfil público não deixa de mostrar o trabalho forte — ele **afirma ativamente que o trabalho
representativo dele é CRUD Java de 2013 a 2018**. Os seis repositórios *pinados* são uma escolha
editorial deliberada, e o push público mais recente é de **2025-10-23**, nove meses atrás, enquanto
83 commits em 7 semanas aconteceram num repositório privado. O caminho de menor esforço para maior
ganho de percepção não é abrir o EngineOS: é publicar **um** artefato de enforcement extraído do que
já existe em disco e repontar o perfil para ele — sem depender de alcance, porque o mecanismo é
profundidade, não audiência.

---

## Grounding

### O que foi verificado hoje (fontes primárias, fetched 2026-07-30)

**`https://api.github.com/users/ricardofagmer`** (JSON bruto, fetched 2026-07-30):

| Campo | Valor |
|---|---|
| `bio` | "🚀IT professional for over 15 years working as developer with Javascript, Typescript, Node, Nest and **Angular**." |
| `followers` / `following` | **6** / 11 |
| `public_repos` | 14 |
| `location` | Londrina |
| `company` | `@fagmer` |
| `blog` | `https://www.linkedin.com/in/ricardo-fagmer/` |
| `twitter_username` | `null` |
| `created_at` | 2014-09-15 |

**`https://api.github.com/users/ricardofagmer/repos?sort=pushed`** (fetched 2026-07-30) — os 14
repositórios públicos, com `stargazers_count`:

| Repo | Linguagem | Fork | `pushed_at` | Stars |
|---|---|---|---|---|
| nest-model | TypeScript | não | 2025-10-23 | 0 |
| cuboid-challenge-node | TypeScript | não | 2025-10-23 | 0 |
| graphQL | TypeScript | não | 2024-12-18 | 0 |
| angular-16 | — | não | 2023-10-16 | 0 |
| react-template | — | não | 2022-05-02 | 0 |
| react-adminlte-master-classes | JavaScript | não | 2022-02-04 | 0 |
| some-tests ("interview-tests") | TypeScript | não | 2022-01-20 | 0 |
| base-factory | — | não | 2021-11-26 | 0 |
| treinee | — | não | 2021-10-26 | 0 |
| ecommerce | JavaScript | não | 2021-10-07 | 0 |
| pec | Java | não | 2018-02-07 | 0 |
| equipamento_maven | — | não | 2017-08-28 | 0 |
| agro | — | não | 2016-05-20 | 0 |
| DatabaseAutoCompleteLibrary | Java | **sim** | 2013-11-28 | 0 |

Dois fatos que a brief não continha e que mudam a leitura:

1. **Todos os 14 repositórios têm 0 stars.** Em 12 anos de conta (desde 2014-09-15), zero validação
   externa registrada em qualquer artefato próprio.
2. **O push público mais recente é 2025-10-23** — nove meses de silêncio público, exatamente o
   período em que a atividade real explodiu (primeiro commit do EngineOS 2026-06-11, 83 commits em
   7 semanas — brief §2).

**Repositórios pinados** (`https://github.com/ricardofagmer`, fetched 2026-07-30), na ordem exibida:
`DatabaseAutoCompleteLibrary` (fork Java, último push **2013-11-28**), `agro` (2016), `equipamento_maven`
(2017), `pec` (Java, 2018), `cuboid-challenge-node` (desafio de entrevista), `ecommerce` (2021).
Badges exibidos: Pair Extraordinaire ×3, Pull Shark ×3, YOLO, Quickdraw.

**`https://www.freelancermap.com/profile/ricardo-fagmer`** (fetched 2026-07-30, **página atualizada
em 2024-10-30**): headline "Senior Software Engineer | JavaScript | TypeScript | Node | Nest |
Angular | Nx"; empregador listado **Scalio**; disponibilidade "**100% available**"; inglês fluente.

**LinkedIn `ricardo-fagmer`**: `https://www.linkedin.com/in/ricardo-fagmer/` redireciona 301 para
`https://br.linkedin.com/in/ricardo-fagmer`, que responde **HTTP 999** (bloqueio de scraping).
Nada foi verificável ali.

### UNKNOWN — declarado, não inventado

| # | Fato | Efeito na conclusão |
|---|---|---|
| 1 | **Contagem de conexões/seguidores no LinkedIn, headline atual, atividade de posts** — HTTP 999, não fetchável | Se houver audiência engajada relevante, a prioridade de canal da Ação 3 está invertida. É o maior furo do plano. |
| 2 | **Empregador atual** — três sinais públicos conflitantes: freelancermap diz Scalio (página de 2024-10-30); o contexto de sessão traz o domínio `spesia.com.br`; um snippet de busca (2026-07-30) mencionou "rindus". Nenhum verificável por fonte primária | Não uso o empregador em nenhuma recomendação. O ponto que *importa* é que o registro público está contraditório e velho. |
| 3 | **Cláusulas de IP / moonlighting do emprego atual** (brief §6) | Pode bloquear qualquer publicação derivada. Não é orientação jurídica — verificar com o contrato. |
| 4 | **Audiência fora do GitHub** (newsletter, YouTube, X) | `twitter_username` é `null`; nada mais encontrado. Assumo zero audiência própria em todo o plano. |
| 5 | **Se o time de 2–10 pessoas do PRD é real na empresa** (brief §6) | Se for real, adoção interna é rota de autoridade mais rápida que escrita pública, e este plano vira segunda prioridade. |
| 6 | **Tamanho/atividade de r/brdev** — busca em PT (2026-07-30) não retornou nada relevante | Descartado como canal por falta de verificação, não por juízo de valor. |
| 7 | **Histórico de tráfego/stars ao longo do tempo** dos repos | Só o estado atual (0 stars em todos) é verificável. |

### O inventário honesto de conquista (o que está em disco)

- `hooks/hooks.json` — **6 hooks realmente ligados**: `task-scale-advisor.sh` (`hooks/hooks.json:9`),
  `route-before-change.sh` (`:20`), `mark-unrecorded.sh` (`:31`), `post-edit-check.sh` (`:35`),
  `stop-verify.sh` (`:46`), `record-verify.sh` (`:50`).
- **13** arquivos em `rules/`, **18** agentes em `agents/`, **11** design specs em `docs/specs/`,
  **22** change records arquivados em `.engineos/archived/` (14 em junho, 8 em julho).
- Adaptador Cursor real: `templates/cursor/` + `docs/specs/2026-06-19-cursor-adapter-design.md`
  (11.005 bytes) — prova de portabilidade entre ferramentas.
- `LICENSE:1` — MIT, "Copyright (c) 2026 Ricardo Fagmer".
- Contradições que importam para posicionamento: `docs/PRD.md:29` lista ferramentas não-Claude
  (Cursor, Copilot) como **non-goal** explícito, e o adaptador Cursor foi mergeado mesmo assim, sem
  ADR de superação; `.engineos/memory/` contém **apenas** `README.md` após 22 mudanças concluídas.

### Contexto de mercado (fontes datadas)

- **AGENTS.md é o baseline neutro do setor.** `https://agents.md` (fetched 2026-07-30): "simple,
  open format for guiding coding agents", **stewarded pela Agentic AI Foundation / Linux Foundation**,
  **60.000+ repositórios** open-source, 25+ ferramentas suportando (Codex, Cursor, Copilot Coding
  Agent, Gemini CLI, Jules, Devin, Junie, Zed, Warp, Windsurf…). Repo `agentsmd/agents.md`
  (fetched 2026-07-30): **23.3k stars, 84 issues abertas, 78 PRs abertos** — discussão viva, não
  arquivada. Formalização em agosto de 2025 (OpenAI, Google, Cursor, Factory, Sourcegraph), por
  fontes secundárias de 2026.
- **A fronteira "instrução vs. enforcement" é o debate ativo — e já é comentário mainstream.**
  "From CLAUDE.md to Hooks: How to Make AI Agents Actually Follow Rules" (Medium, Ilia Popov,
  **abr/2026**); "Agent Hooks: Deterministic Guardrails for AI-Generated Code" (bitbytebit
  substack); "An Empirical Study: AI Agent Rules Need Context and Layered Enforcement" (eunomia,
  **2026-07-15**). Tese recorrente: instruções em markdown atingem 70–90% de compliance e caem sob
  pressão de contexto; hooks executam fora da cadeia de raciocínio do modelo. `asdlc.io` formula a
  regra que o EngineOS já encarna: se uma restrição pode ser imposta deterministicamente por uma
  ferramenta do repo, ela **não** deve ser reescrita no agents.md — a ferramenta *é* a restrição.
  **Consequência dura, conforme a regra §7 da brief:** a *tese* não tem vantagem de timing. O que
  tem vantagem é a **evidência longitudinal** — 7 semanas, 83 commits, 22 change records sob gates
  reais. Quem escreve sobre o tema argumenta; ele tem corpus.
- **Canal PT-BR verificado:** TabNews (`tabnews.com.br`) publica ativamente sobre Claude Code e
  agentes — ex.: "Claude Code vs Codex vs Gemini: Quem Venceu a Batalha dos Agentes de IA para
  Desenvolvedores" e "Criei uma IDE de terminal pra trabalhar com agentes de IA (Claude Code,
  Gemini CLI, Codex)" (busca 2026-07-30). O FAQ (`tabnews.com.br/faq`, fetched 2026-07-30) descreve
  o ranking "Relevantes" por **tempo desde a publicação, avaliação positiva e engajamento em
  comentários** — e **não menciona seguidores em nenhum ponto** do mecanismo de alcance. Isso
  qualifica o canal sob a regra absoluta.
- **Comunidade EN:** r/ClaudeCode com **4.200+ contribuidores semanais** no início de 2026, ~3× o
  r/Codex (morphllm, "Claude Code Reddit: What Developers Actually Say (2026)"). Fonte secundária,
  não confirmada em fonte primária — tratada como indicativa.
- **Discurso PT-BR sobre governança de IA existe e está genérico:** "Engenharia com IA exige mais
  método, não menos. Sem governança, contexto e supervisão humana, o uso de IA tende a amplificar
  erros" (Alura / iMasters / Accurate, 2026). Ou seja: em português há *tese* de governança e
  quase nenhuma *implementação demonstrável*. É a lacuna onde ele cabe.
- **Restrição de canal a respeitar:** listas do tipo *awesome-claude-code* rejeitam PRs cujo
  propósito principal é promover projeto próprio (busca 2026-07-30). Participação tem de ser
  contribuição substantiva, nunca link-drop.

---

## Analysis

### STEP 1 — O gap de percepção

**Hoje — o que um estranho conclui em 60 segundos** (só com o que foi verificado acima):

Abre `github.com/ricardofagmer`. Lê a bio: 15 anos, JavaScript, TypeScript, Node, Nest, **Angular**.
Olha os seis pins: um **fork Java de 2013**, dois projetos de 2016–2017, um Java de 2018, um desafio
de entrevista e um `ecommerce` de 2021. Bate o olho na atividade: último push público **out/2025**.
Nota 6 seguidores e nenhuma star em nada. Se for a um segundo lugar, acha o freelancermap de
**out/2024** dizendo "100% available" com Angular e Nx no headline.

Conclusão do estranho: *desenvolvedor sênior brasileiro, carreira longa, stack Angular/Node
corporativa, portfólio de CRUD e ERP, produção pública desacelerando desde 2025, provavelmente
disponível para contrato.* **Zero** sinal de IA, de agentes, de arquitetura, de governança de
engenharia. Nada que sugira que essa pessoa é uma das que pensam com mais profundidade sobre como
um time faz agentes de código obedecerem a padrões.

**A posição desejada em 12 meses — INFERIDA, não fornecida.**

> ⚠️ **Isto é inferência, não briefing.** Foi derivada de duas coisas: (a) ele selecionou
> *reputação* **e** *adotantes* **e** *dinheiro* como resultados desejados (brief, cabeçalho), e
> (b) construiu um sistema de **governança de engenharia em escala de time** — `docs/PRD.md:4`
> escopa explicitamente "um time de 2–10 pessoas". Ele não construiu uma ferramenta pessoal de
> produtividade; construiu um instrumento de conformidade coletiva. Isso implica uma posição, e a
> posição implicada é:

**"A pessoa que tem uma resposta funcionando — e auditável — para como um time faz agentes de código
obedecerem aos seus padrões de engenharia de forma determinística."** Não influenciador de IA, não
dev sênior genérico: **autoridade de praticante em governança de agentes**. Operacionalmente: o nome
que um tech lead cita ao defender gates de agente numa reunião, e o nome que um time contrata para
montar isso.

**Teste da inferência contra o repo.** *Sustentada em substância:* 6 hooks ligados
(`hooks/hooks.json:9,20,31,35,46,50`), 13 rules, 18 agentes, 11 specs, 22 change records, adaptador
Cursor provando portabilidade. *Não sustentada em prova social:* zero adotantes externos —
estruturalmente zero, porque os dois caminhos de instalação documentados (`README.md:18` clone SSH;
`README.md:24-25` plugin marketplace) apontam para um repositório que retorna **HTTP 404** (brief §3)
— e nenhum segundo humano jamais exercitou as features de time (brief §5.1).
**Correção honesta da posição:** o alvo de 12 meses tem de ser *autoridade no desenho e na imposição
de governança de agentes*, **não** "líder de uma plataforma adotada". A segunda exige adotantes que
ele não tem e não pode obter enquanto o repo é privado. Reivindicar a segunda seria exatamente o
tipo de alegação que o playbook proíbe.

**O gap, em uma frase:** entre "contractor Angular cuja produção pública parou em 2025" e "praticante
de referência em governança de agentes" — e a distância **não** é de competência (essa está em
disco), é **inteiramente de evidência transmissível**.

#### O UM sinal mais danoso

**Os seis repositórios pinados.**

Não é "o trabalho bom está privado", e não é a bio. É o fato de que os pins — o único controle
editorial que o GitHub oferece — declaram que seu trabalho mais representativo é um **fork Java cujo
último push é 2013-11-28**, mais projetos de 2016–2018 e um desafio de entrevista.

**Por que este custa mais que os outros dois candidatos:**

- **vs. "o artefato mais forte é invisível / os mais fracos são visíveis":** este é aquele candidato,
  mas afiado no vetor que realmente transmite. O EngineOS ser invisível é uma **ausência de
  evidência** — custa oportunidade, é neutro na leitura. Os pins são uma **afirmação positiva
  errada** — custam credibilidade. Uma lacuna deixa o avaliador indeciso; uma alegação equivocada o
  faz decidir contra. E o efeito é composto com o push público mais recente de 2025-10-23 e as 0
  stars: o perfil lê como **carreira desacelerando**, no exato momento em que a produção real está
  no pico da carreira. Nenhuma quantidade de trabalho privado corrige isso, porque a parte visível
  é a única que transmite.
- **vs. a bio nomeando Angular:** custa, mas é dano de *desatualização*, não de desqualificação —
  um estranho que lê "15 anos JS/TS/Node/Nest" ainda lê sênior competente. Correção de uma linha,
  e eu recomendo fazê-la; só não é o que mais dói.
- **vs. MIT porém privado (`LICENSE:1` + HTTP 404):** este é **invisível ao estranho**. Ninguém
  consegue ver o repositório, portanto ninguém percebe a contradição. É um defeito de
  **distribuição** — pertence aos modos opportunity/monetization —, com dano de *percepção* próximo
  de zero, porque não há nada a perceber.

Os pins também são o mais danoso *e* o mais barato de corrigir entre os que causam dano real: mudar
o que está pinado leva minutos e não exige nenhuma decisão sobre o repositório privado, sobre IP, ou
sobre o emprego.

### STEP 2 — Três ações de autoridade repetíveis

Todas usam matéria-prima **já existente em disco**. Nenhuma tem alcance como mecanismo. Todas
sobrevivem a semanas puladas por desenho.

---

#### Ação 1 — Teardown de enforcement: "a regra que ninguém obedece vs. o hook que ninguém burla"

| | |
|---|---|
| **Frequência** | 1 publicação a cada 2 semanas, com **6 tópicos escritos e enfileirados de uma vez** (um por hook de `hooks/hooks.json`). O buffer é o que torna a cadência imune a semana pulada: pular não quebra a série, só consome estoque. |
| **Canal** | **TabNews** como primário (PT). Verificado: publica ativamente sobre Claude Code/agentes, e o ranking "Relevantes" é por recência + avaliação + comentários, **sem seguidores no mecanismo** (`tabnews.com.br/faq`, fetched 2026-07-30). Espelho em EN no `dev.to` como secundário. |
| **Formato** | Teardown com código real. Cada post pega **uma** regra de `rules/` e mostra os três níveis de compliance (explicação → lembrete → **enforcement**) com o hook concreto que a impõe — `post-edit-check.sh`, `route-before-change.sh`, `stop-verify.sh` etc. Inclui o que o hook **não** cobre. |
| **Sinal** | **"Esta pessoa converte padrão de engenharia em mecanismo, não em opinião."** |

Por que funciona a 6 seguidores: o valor não está em quantas pessoas leem, está em que **o texto
existe e é específico o bastante para ser citado**. Um teardown com o `.sh` real é referência; um
post de tese é ruído. A matéria-prima está pronta — os 6 hooks estão escritos, testados e em uso.

---

#### Ação 2 — Comparação mantida: o modelo de governança do EngineOS contra o baseline AGENTS.md

| | |
|---|---|
| **Frequência** | Toque **mensal** — página viva, não série. Atualiza quando a spec ou uma ferramenta muda. Semana pulada é irrelevante para um documento mantido. |
| **Canal** | Um repositório **público próprio e novo** (ex.: `agent-governance-notes`) — **não** o EngineOS privado. Mais participação substantiva nas issues de `agentsmd/agents.md` (23.3k stars, 84 issues, 78 PRs abertos — fetched 2026-07-30), onde a fronteira instrução-vs-enforcement está em debate aberto. |
| **Formato** | Tabela de comparação mantida + posição documentada sobre **o que o AGENTS.md deliberadamente não cobre**: enforcement determinístico, ciclo de vida de mudança em time, registro durável de decisão. Ancorada nos 6 hooks e nos 22 change records. |
| **Sinal** | **"Esta pessoa conhece o cenário de padrões e sabe onde ficam as bordas dele."** |

Guarda-corpos obrigatórios: listas *awesome-** rejeitam PR promocional (busca 2026-07-30) — logo,
contribuição de conteúdo, jamais link-drop. E **nunca** afirmar adoção que não existe: a comparação
é sobre *desenho*, não sobre base instalada.

---

#### Ação 3 — Estudo de caso longitudinal com números — inclusive os que o desabonam

| | |
|---|---|
| **Frequência** | **Trimestral** (2–3 em 12 meses). Baixa frequência, peso alto; imune a semanas puladas por construção. |
| **Canal** | Artigo no LinkedIn + cópia no repositório público da Ação 2. ⚠️ Tamanho da audiência no LinkedIn é **UNKNOWN** (#1) — e é justamente por isso que o formato é *artigo* e não *post*: o valor é ser encontrável e citável por um lead específico, não ser distribuído. |
| **Formato** | Dados reais: 7 semanas, 83 commits, 22 change records, 11 specs, 1 autor — o que a governança custou e o que mudou. **Incluindo as falhas:** `.engineos/memory/` com só `README.md` após 22 mudanças; o non-goal de `docs/PRD.md:29` revertido pelo adaptador Cursor sem ADR de superação; drift de docs sobre a própria convenção de arquivamento. |
| **Sinal** | **"Esta pessoa relata evidência contra si mesma."** |

Todo mundo que publica sobre governança de agentes mostra o caminho felizarrão. Um relato que abre
os três lugares onde o próprio sistema falhou é raro o suficiente para ser **o** diferencial — e é a
única forma de construir confiança sem prova social.

---

**Checagem de sinais distintos (exigência do playbook).** As Ações 1 e 3 são ambas "escrever sobre o
próprio sistema" e poderiam colidir — não colidem: a **1** é *nível-mecanismo, prospectiva*, ensina
uma técnica reproduzível; a **3** é *nível-resultado, retrospectiva*, reporta evidência incluindo a
negativa. Rigor ≠ honestidade. Os três sinais — **construtor de mecanismo · letrado no cenário ·
auditor de si mesmo** — compõem exatamente a posição inferida: autoridade de praticante. Nenhum
deles é "tem audiência".

---

## The one action

> ## Publicar UM artefato público: o teardown dos 6 hooks de enforcement — e repontar o perfil para ele.
> **Prazo: 2026-08-13** (14 dias a partir de 2026-07-30).

Um entregável, indivisível, em três partes que só funcionam juntas:

1. **Criar um repositório público novo** com o teardown de enforcement: os 6 hooks de
   `hooks/hooks.json`, o que cada um impede, o `.sh` real, e a fronteira instrução-vs-enforcement
   demonstrada em cima deles. Publica **o padrão e o raciocínio** — não o EngineOS inteiro (nada de
   decisão sobre o repo privado, nada de exposição de IP).
2. **Repontar o perfil:** despinar `DatabaseAutoCompleteLibrary` (2013), `agro`, `equipamento_maven`,
   `pec`; pinar este artefato em primeiro.
3. **Reescrever a bio:** trocar "Angular" pelo trabalho real (Node/Nest, React/Next, infraestrutura
   de agentes LLM).

**Por que este e não "tornar o EngineOS público":** abrir o repo é maior em teoria, mas está travado
por um UNKNOWN que eu não posso resolver — cláusulas de IP/moonlighting (#3) — e não é orientação
jurídica minha dar. Este artefato atravessa 14 dias sem essa decisão, e corrige **o sinal mais danoso
(os pins) no mesmo movimento**. Esforço estimado 8–12 h, dentro de 20+ h/semana mesmo com uma semana
perdida, porque a matéria-prima já está escrita e em produção.

**Por que não é dependente de alcance:** o artefato precisa de **uma** pessoa certa lendo. A 6
seguidores, um repositório específico e técnico é encontrável por busca e citável por quem já está
no problema. O mecanismo é especificidade.

### Sinais observáveis de sucesso

1. **Inbound qualificado (o sinal que decide):** ao menos **um** contato — issue, comentário ou DM —
   de alguém que **opera um setup de agentes para um time** (tech lead, staff, platform eng), com
   pergunta sobre comportamento de hook, precedência de config ou ordem de gate. **Não** conta
   "repo legal". Um contato desses a 6 seguidores **é** sucesso.
2. **Tipo específico de pessoa engajando:** alguém de fora do Brasil, ou alguém do orbe
   `agentsmd/agents.md`, referenciando o artefato.
3. **Query começando a fazê-lo aparecer:** buscar `Claude Code hooks enforcement` ou
   `hooks vs CLAUDE.md compliance` com o nome dele, ou buscar `ricardofagmer`, retorna este artefato
   — e não o fork Java de 2013.
4. **Marco medível de linha de base:** a **primeira star não-zero** em um repositório de autoria
   própria. Barra baixa, mas seria o primeiro dado de validação externa em 12 anos de conta (hoje:
   0 stars em 14 de 14).

---

## What would falsify this

1. **Se o LinkedIn tiver audiência engajada substantiva** (UNKNOWN #1 — HTTP 999 impediu verificar):
   a prioridade de canal está invertida. LinkedIn passa a primário, TabNews a secundário, e a Ação 3
   sobe de trimestral para mensal. **Este é o furo mais provável de derrubar o plano — resolva-o
   primeiro, em 5 minutos, olhando o próprio perfil logado.**
2. **Se o contrato de trabalho proibir publicar obra derivada** (UNKNOWN #3): até o teardown de hooks
   está bloqueado. Aí só resta escrita genérica sem artefato de código, e o plano inteiro perde a
   perna que o sustenta — porque o diferencial *é* o artefato. Não é orientação jurídica: verificar
   o contrato.
3. **Se o time de 2–10 pessoas do PRD for real** (UNKNOWN #5): adoção interna gera prova social mais
   rápido que qualquer publicação, e este plano externo cai para segunda prioridade. Um segundo
   humano usando o sistema vale mais que três artigos.
4. **Se a tese "instrução vs. enforcement" saturar até o Q4/2026:** ela **já** é comentário
   mainstream (Medium abr/2026; eunomia 2026-07-15). Se autores com mais credencial ocuparem o
   espaço, só o **dado longitudinal** sobrevive como vantagem — e se 22 change records se mostrarem
   corpus pequeno demais para interessar terceiros, a Ação 3 falha e a posição não se sustenta em
   escrita.
5. **Se após 3 artefatos em 90 dias houver zero inbound qualificado:** a hipótese central — que
   profundidade vence alcance a 6 seguidores neste nicho — está errada. Pivô: contribuição
   substantiva **dentro** de um repositório de alto tráfego já existente (issues do
   `agentsmd/agents.md`), onde a distribuição é emprestada em vez de construída.
6. **Se um adotante externo aparecer sem nenhuma das ações:** então o gargalo nunca foi percepção,
   e sim visibilidade pura (o 404) — e o modo de distribuição, não este, tem a resposta.

---

**Confiança: média-alta.**

*Alta* no STEP 1: o footprint público foi verificado em fontes primárias hoje (API do GitHub, perfil,
freelancermap), e as 0 stars + push de 2025-10-23 + os pins de 2013 são fatos, não leitura. A escolha
do *um* sinal mais danoso é juízo defensável, não medição.
*Média* nos STEPs 2 e 3: comportamento de canal e resposta de inbound são previsões; o LinkedIn
UNKNOWN é um furo real na priorização de canal; e r/ClaudeCode entrou por fonte secundária apenas.
Rebaixa a confiança geral, e é por isso que a falsificação #1 vem primeiro.

Nada aqui é orientação jurídica ou financeira; onde toca contrato de trabalho e IP, verificar com
o contrato e com quem seja de direito.
