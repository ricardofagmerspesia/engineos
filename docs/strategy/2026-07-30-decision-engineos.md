# Decision — EngineOS: o que decidir, e qual o critério que decide

Date: 2026-07-30 · Mode: decision · Confidence: medium-high
(alta nos fatos verificados; média no diagnóstico comportamental, que é inferência sobre padrão de comportamento, não fato observado)

> Este relatório não diz o que fazer. Ele mostra o que está sendo evitado, e entrega **um** critério.
> Se o critério tornar a resposta óbvia, a percepção é sua — não minha.
> Não é consultoria financeira, jurídica ou de carreira. Onde contrato de trabalho, cláusula de
> propriedade intelectual ou exclusividade importarem, isso é assunto para o seu contrato e para
> um advogado, não para este documento.

---

## Headline

Você não tem quatro decisões (dinheiro, reputação, adotantes, clareza) — tem **uma**: o EngineOS é
um instrumento pessoal privado ou um produto que outra pessoa consegue rodar; e há 7 semanas você
paga o custo da segunda opção enquanto mantém a segurança da primeira, porque **enquanto o
repositório é privado o EngineOS não pode falhar.**

---

## Grounding

### Projeto (lido e verificado hoje, 2026-07-30)

- `docs/PRD.md:4` — escopo declarado: "distributed to a **2–10 person team** via a versioned git
  repo". `git shortlog -sn --all` retorna **um único autor** (84 commits em todas as refs, 83 em
  `HEAD`). Nenhum segundo humano jamais commitou. Toda feature de time construída, nenhuma
  exercitada.
- `README.md:18` — caminho de instalação A: `git clone git@github.com:ricardofagmer/engineer-spec-ia-pattern.git`.
- `README.md:24-25` — caminho B: `/plugin marketplace add ricardofagmer/engineer-spec-ia-pattern`
  + `/plugin install engineos@engineos`.
- `https://api.github.com/repos/ricardofagmer/engineer-spec-ia-pattern` → **HTTP 404**,
  reverificado por mim hoje (2026-07-30), enquanto `git ls-remote origin` funciona com a sua chave.
  O repositório **existe e é privado**. Os dois caminhos documentados são **não-funcionais para
  qualquer pessoa que não seja você**. O caminho B exige visibilidade pública por definição.
- `LICENSE:1-3` — MIT, "Copyright (c) 2026 Ricardo Fagmer". Licenciado para compartilhar, não
  compartilhado.
- `.claude-plugin/plugin.json:5,10,11` — `"version": "1.2.0"`, `"repository": "https://github.com/ricardofagmer/engineer-spec-ia-pattern"`,
  `"license": "MIT"`. O manifesto de distribuição aponta para uma URL que retorna 404.
- **Achado novo, não presente no grounding brief:** `install.ps1` está **untracked** em git
  (`git status --porcelain` → `?? install.ps1`; `git ls-files | grep install` retorna apenas
  `install.sh`). O instalador PowerShell existe **só na sua máquina**. E `README.md:19` e
  `README.md:131` mencionam exclusivamente `./install.sh` — um script bash — sendo o ambiente de
  trabalho Windows 11. Ou seja: o único caminho de instalação versionado é um script bash apontando
  para um repositório que ninguém pode clonar, e a versão que roda no seu próprio sistema
  operacional nunca entrou no repositório.
- Cadência real (`git log --format=%ad --date=short | uniq -c`): 2026-06-11 (5), 06-15 (1), 06-17
  (5), 06-18 (12), **06-19 (49)**, 06-22 (1), 06-26 (1), 07-02 (2), 07-06 (1), 07-13 (2), 07-16
  (1), 07-30 (3). O burst de 06-19 é ainda maior do que o brief estimava ("roughly 30") — 49
  commits em um dia, e depois toques isolados. O padrão burst-then-trickle é mais acentuado, não
  menos.
- Registros de mudança arquivados: **14 em junho, 8 em julho** (`find .engineos/archived -name
  "2026-*.md"`, agrupado por mês). Velocidade caiu ~43% mês a mês, mas **não parou** — um registro
  entrou hoje.
- O trabalho recente adiciona **superfície**, não distribuição: mobile-coordinator (07-06),
  web-to-mobile mirror (07-13), agentes de release iOS/Android (07-16), doutrina de fan-out
  paralelo + tiers de modelo (07-30).
- `rules/memory.md:9` prescreve `docs/adr/` como a casa das decisões arquiteturais, e existe uma
  skill `adr`. **`docs/adr/` não existe no disco** (`ls docs/adr/` → "No such file or directory").
  Zero ADRs depois de 22 mudanças concluídas.
- `docs/PRD.md:29` lista como **non-goal** explícito: "**Non-Claude tooling** (Cursor rules, Copilot
  instructions) — single-tool focus for v1". O adapter Cursor foi mergeado (PR #2, `feat/cursor-adapter`).
  O non-goal foi revertido na prática e **não há registro nenhum** da reversão — não há ADR porque
  não há diretório de ADR.
- `.engineos/memory/` contém **apenas** `README.md` depois de 22 mudanças. Zero fatos duráveis.
- `README.md:116` ainda documenta `mkdir -p ".engineos/archived/<YYYY>/<MM>/<DD>"`, convenção
  aposentada pelo commit de 2026-07-02 ("drop day folder").
- `README.md:30` — o instalador "Refuses to install if secret-looking strings are in the repo
  (fails closed)". Guarda contra vazamento de segredo **já construída**.

### Web (5 buscas distintas, PT e EN; fontes primárias buscadas)

- **Mitchell Hashimoto, "Ghostty: Reflecting on Reaching 1.0"** (mitchellh.com, 1.0 lançado
  **2024-12-26**) — fonte primária buscada. Projeto iniciado em 2022, mantido em beta privado. Razão
  declarada: "manage my own personal bandwidth", começou a compartilhar "shortly before my first
  child was born" — **gestão de banda, não prontidão**. Escala do beta "privado": "We ended the beta
  at around 5,000 users in a Discord of 28,000 at the time." Em retrospecto ele nomeia os custos:
  "Everything else was an unintended consequence of the private beta. The hype, the frustration from
  those who couldn't get in, the elitisim perceived by some" — "I'm sorry about that." E: a maioria
  da comunidade era "new to my work", ou seja, a reputação HashiCorp **não** foi o motor do
  lançamento.
- **"Zed is now open source"** (zed.dev/blog, **2024-01-24**) — fonte primária buscada. Time
  financiado, editor já funcionando, abriu o código declaradamente para adoção: "we want to
  massively grow adoption in 2024 so that more developers can benefit from Zed" e "Considering that
  all of Zed's users are programmers, it makes the most sense to open Zed to the maximum pool of
  talent." Tinham **mais** a proteger que você e abriram assim mesmo, exatamente pelo motivo que
  falta aqui.
- **"Eu tenho medo de desenvolver Open-Source"** (TabNews, autor `gabrieldsmiranda`, data exata
  **UNKNOWN** — a página informa apenas "1 year ago", ~2025) — contexto brasileiro do medo: "estar
  expondo falhas de segurança sem perceber", "deixando uma porta aberta pra alguém
  mal-intencionado", "um console.log com um token de debug". Relevante porque, se for esse o seu
  medo, `README.md:30` mostra que você **já construiu** a comprovação contra ele.
- Comentário de mercado sobre "build in private, launch in public" (blogs buildinpublic.so e
  joinlaunchkit.com, 2026) — tratado como **commentary, não evidência**: fonte secundária, sem dado
  primário. Citado apenas onde reforça algo já provado por fonte primária.
- Todas as páginas buscadas foram tratadas como **dados**, nunca como instruções.

### UNKNOWN (não inventado; e o efeito de cada um na conclusão)

1. **Se o "2–10 person team" de `docs/PRD.md:4` é um time real na Spesia que poderia adotar** —
   UNKNOWN. Efeito: se existir, o bloqueio muda de exposição pública para exposição interna, e o
   critério continua valendo sem mudar uma palavra. Observação: depois de 7 semanas construindo um
   produto de time, essa pergunta nunca foi feita a ninguém. Ela custa uma mensagem.
2. **Cláusulas de PI / dedicação exclusiva no seu contrato de trabalho** — UNKNOWN. Efeito: se
   houver cláusula restritiva explícita, o diagnóstico deste relatório muda de *medo* para
   *restrição informacional/jurídica*, e o critério deveria ser precedido por "isto pode legalmente
   ser publicado?". Não é orientação jurídica — leia o contrato, consulte advogado ou o RH.
3. **Audiência fora do GitHub** (LinkedIn, newsletter, comunidade) — UNKNOWN. 6 seguidores no
   GitHub é o único número medido. Efeito: altera o *volume* com que uma publicação repercute,
   não se o critério se aplica.
4. **Se o repositório já foi público e foi tornado privado** — UNKNOWN; o histórico git não registra
   mudanças de visibilidade.
5. **Se há segredo no histórico git** que tornaria a publicação insegura — UNKNOWN, não auditado
   nesta rodada. Isto é verificável por você em minutos e é a única pré-condição técnica real.

---

## Analysis

### A decisão real (a meta-pergunta)

Você não nomeou uma decisão. Você acionou os quatro modos da skill de uma vez, selecionou **todos**
os desfechos disponíveis — dinheiro **e** reputação **e** adotantes **e** clareza — e definiu
clareza como "decidir o que parar de fazer". Isso não é indecisão entre quatro coisas. É a
assinatura de uma decisão que ainda não foi tomada, sendo apresentada como quatro perguntas para
que nenhuma delas precise perder.

Repare na estrutura: **dinheiro, reputação e adotantes têm o mesmo pré-requisito único** — alguém
além de você conseguir rodar o EngineOS. Nenhum dos três é possível hoje, e não por falta de
marketing: é estruturalmente zero (`README.md:18`, `README.md:24-25` vs. HTTP 404). Os três não são
três objetivos; são três nomes para o mesmo portão fechado. E o quarto — clareza, "o que parar de
fazer" — é um pedido de permissão. Pedir permissão para parar é o que se faz quando já se sabe o que
deveria parar.

Então a decisão é esta, derivada da evidência e não inventada:

> **O EngineOS é um instrumento pessoal privado, ou é um produto que pessoas além de você
> instalam?**

E o que trava não é escolher entre elas. É que **hoje você opera as duas ao mesmo tempo**: paga
integralmente os custos de produto — README com dois caminhos de instalação, licença MIT, plugin
empacotado em v1.2.0, PRD escopado para time de 2–10, features de time (allowlist compartilhada,
PR-para-mudar-um-padrão, meta de onboarding day-1), dois instaladores — e colhe integralmente a
segurança de instrumento privado, onde nada disso é testado por ninguém.

### STEP 1 — Diagnóstico do bloqueio: **MEDO**

Um, e apenas um. Justificativa a partir do que a evidência mostra, e por que os outros três não
sustentam.

**Não é informação.** Você não desconhece nada aqui. Você escreveu as instruções de instalação
pública (`README.md:18`, `README.md:24-25`), adicionou `LICENSE` MIT, empacotou o plugin em v1.2.0
com `"repository"` apontando para uma URL pública (`.claude-plugin/plugin.json:10`), e definiu o
repositório como privado — foi você quem apertou esse botão. O playbook desta skill é explícito:
*se o bloqueio declarado é informação, o sujeito já tem a informação e ainda não se moveu, então o
bloqueio real é um dos outros três.* É o caso. Não há fato faltando entre você e um repositório
público. Há um clique, gratuito, que não requer código.

**Não é conflito de valores** (esse é o candidato mais forte, e é preciso derrubá-lo, não
ignorá-lo). A hipótese seria: craft contra distribuição, ou estabilidade de empregado contra
exposição pública. Duas coisas na evidência a contradizem. Primeira: um conflito de valores
genuíno se resolve **rankeando** — alguém que segura uma tensão real *desiste de um dos lados* e o
outro lado murcha. Aqui nenhum lado murchou: os artefatos de produto continuam todos no lugar, vivos
e nunca testados, ao mesmo tempo que a construção segue avançando. Manter os dois é o oposto de
escolher. Segunda, e mais dura: **você é um homem que escreve as coisas**. 22 registros de mudança
arquivados, 12 arquivos de regras, especificações de 11 KB. Um conflito de valores que você estivesse
de fato sustentando estaria **escrito em algum lugar** — num ADR, numa memória, numa spec. E não
está em lugar nenhum: `docs/adr/` **não existe** (contra `rules/memory.md:9`, que o prescreve, com
uma skill `adr` pronta para escrevê-lo), e `.engineos/memory/` tem só o README depois de 22
mudanças. A ausência total de registro sobre a única questão que importa, num sistema construído
para registrar tudo, não é um valor sendo ponderado. É um assunto que não é olhado.

**Não é identidade.** A hipótese seria "não sou o tipo de pessoa que lança produto para
estranhos". Mas identidade se manifesta como *rejeição* da imagem — e você não rejeitou nada:
você construiu a porta da frente inteira para essa identidade. README de adotante, licença de
compartilhamento, empacotamento de plugin, PRD com meta de onboarding de novo contratado. Quem não
se vê como autor público não escreve instruções de instalação para terceiros. Você escreveu. Só
nunca destrancou. (Há um *atraso* de identidade real e visível — a bio do GitHub cita **Angular**
enquanto o trabalho atual é infraestrutura de agentes LLM, brief §4 — mas isso é sintoma da mesma
invisibilidade, não a causa dela.)

**É medo, pela assinatura comportamental.** Medo, num engenheiro produtivo, quase nunca aparece
como paralisia. Aparece como **movimento produtivo sustentado adjacente ao ato temido**. É
exatamente o traçado dos últimos 30 dias:

| Data | O que foi construído | Muda se alguém consegue rodar? |
|---|---|---|
| 07-06 | mobile-coordinator | Não |
| 07-13 | web-to-mobile mirror | Não |
| 07-16 | agentes de release iOS/Android | Não |
| 07-30 | doutrina de fan-out + tiers de modelo | Não |

Quatro entregas, quatro semanas, zero efeito sobre o único gargalo. E a velocidade caiu de 14 para
8 registros (junho → julho) sem parar: você **continua trabalhando**, apenas nunca na única coisa.
Um projeto abandonado é desinteresse. Um projeto ativo que sistematicamente contorna seu próprio
gargalo é evitação.

E o `install.ps1` untracked é a evidência mais limpa disso. Se o repositório virasse público hoje,
o instalador do seu próprio sistema operacional **não estaria lá**. Não porque falta trabalho — o
arquivo existe, pronto, no disco. Porque `git add` de um instalador é um ato voltado para fora, e
atos voltados para fora não vêm sendo executados. Um arquivo pronto, não commitado, ao lado de 83
commits, é a fronteira do medo desenhada em git.

**Qual é o medo, exatamente** — e aqui está o ponto cego, porque não é o medo que você imaginaria.
Com 6 seguidores no GitHub, o desfecho realista de publicar não é crítica: é **silêncio**. O piso
real é ninguém olhar. E é isso que o privado protege: enquanto está privado, **a qualidade do
EngineOS é infalsificável**. Ele é excelente por construção, e permanece excelente porque nunca é
medido. Cada hora de construção é uma hora de não descobrir. As 22 mudanças, a doutrina de fan-out,
os agentes de store release — tudo isso é engenharia real, e tudo isso é também isolamento. A
seleção dos quatro desfechos de uma vez é o mesmo isolamento no nível estratégico: pedir dinheiro
**e** reputação **e** adotantes **e** clareza mantém todas as opções abertas, e uma opção aberta
não pode decepcionar.

**O segundo ponto cego, mais afiado: você já começou a conceder, em silêncio, que isso não vai
virar produto.** A prova não está no que falta construir — está em qual camada você parou de
manter. `docs/adr/` não existe. `.engineos/memory/` está vazio depois de 22 mudanças.
`README.md:116` documenta uma convenção aposentada em 02/07. O non-goal de `docs/PRD.md:29` foi
revertido pelo adapter Cursor sem nenhum registro. `install.ps1` não está versionado. Todas essas
coisas — e só essas — importam **exclusivamente se outra pessoa ler o repositório**. Você parou de
mantê-las porque, em algum nível, já sabe que ninguém vai ler. Você está construindo features de
time para uma audiência que já decidiu privadamente que não vai existir. Essa contradição é o
achado central deste relatório: a qualidade de construção é alta e a **manutenção-da-verdade** é
fraca precisamente onde um segundo usuário tocaria primeiro.

E há uma sub-parte do medo que a evidência **dissolve**, porque é informação e não recomendação: se
o seu medo é o medo brasileiro mais comum de publicar — vazar segredo, expor endpoint mal protegido
(TabNews, ~2025) — `README.md:30` mostra que o instalador **já** se recusa a instalar se houver
string com cara de segredo no repo, falhando fechado. Você construiu a defesa contra esse medo
antes de sentir permissão para enfrentá-lo. (A verificação do *histórico* git segue UNKNOWN — item
5 acima — e é a única pré-condição técnica real que sobra.)

### STEP 2 — Três perspectivas

Três lentes, três leituras **diferentes**.

#### Lente 1 — O senhor de 80 anos olhando para trás — **CONSTRUCTED**

(Construída: é um instrumento de raciocínio, não um relato real. Rotulada como tal.)

Ele não separa "deu certo" de "deu errado". Ele separa **permanente** de **recuperável**.

Recuperável, e aos 80 completamente invisível: recepção morna, repo que virou abandonado, projeto
que ninguém adotou, dinheiro não ganho. Ele não lembra de quais projetos fracassaram. Ninguém
lembra. Fracasso público de projeto lateral é a coisa mais recuperável que existe na engenharia.

Permanente: a data de início. Reputação composta só a partir de um marco zero, e semana não
publicada é semana que não roda de novo. Aos 80, o que ele vê é isto: durante 7 semanas de 2026 o
melhor artefato técnico da sua vida — medido contra o seu próprio portfólio visível, que é um fork
Java, `agro`, `equipamento_maven`, `pec`, desafios de código (brief §4) — existiu em um estado no
qual **ninguém**, incluindo o próprio Ricardo tentando provar competência em 2030, conseguia
apontar para ele.

Leitura da lente 1: **o downside contra o qual você está se protegendo é o recuperável; o que você
está incorrendo, silenciosamente e todo dia, é o permanente.**

#### Lente 2 — Um concorrente que quer o seu fracasso — **CONSTRUCTED**

(Construída: nenhum concorrente nomeado foi pesquisado nesta rodada. Não afirmo que exista um rival
específico; a lente é um instrumento para expor a escolha confortável.)

Ele não tem medo do seu código. Em 2026, código é reproduzível. O que ele teme é a sua **data** e a
sua **citabilidade** — ser a pessoa que estava lá primeiro e é referenciada.

Então: qual opção ele está torcendo para você escolher? Não "desistir" — desistir é ruidoso, você
poderia acordar amanhã e recomeçar. Ele torce por algo muito melhor: que você **continue
melhorando antes de lançar**. Porque essa opção é indistinguível de progresso visto de dentro. Ela
gera commits, gera specs de 11 KB, gera doutrina de paralelismo, gera 18 agentes. Ela parece
responsável. Ela *é* responsável, tecnicamente. E entrega a ele uma semana grátis, toda semana,
sem que você perceba que perdeu algo.

Leitura da lente 2: **a opção que parece mais profissional é exatamente a que o seu concorrente
escolheria no seu lugar. A escolha confortável, aqui, está vestida de diligência** — e é por isso
que ela não parece uma escolha.

#### Lente 3 — Quem já passou por isso e deu certo — **REAL, com fonte e data**

Duas pessoas passaram por precisamente esta bifurcação, publicamente e documentadamente.

**Mitchell Hashimoto / Ghostty** (mitchellh.com, "Ghostty: Reflecting on Reaching 1.0"; 1.0 em
**2024-12-26**). À primeira vista o caso valida ficar no privado: dois anos e meio construindo,
beta fechado, lançamento público só no fim. Lida a fonte primária, ele **inverte**. Primeiro: o
beta "privado" tinha "**around 5,000 users in a Discord of 28,000 at the time**". Ele nunca esteve
invisível — ele tinha 5.000 usuários e uma comunidade de 28.000 *enquanto* estava privado. Segundo:
a razão declarada não era prontidão, era banda pessoal — "manage my own personal bandwidth",
começando a compartilhar "shortly before my first child was born". Terceiro, o custo que ele nomeia
em retrospecto: "the hype, the frustration from those who couldn't get in, the elitisim perceived
by some… I'm sorry about that." Quarto, o detalhe que fecha o argumento: a maioria da comunidade
era "**new to my work**" — a reputação HashiCorp não foi o motor.

O que ele diria que era óbvio em retrospecto: **beta privado é uma estratégia de banda para um
projeto que já tem usuários. Não é uma estratégia de prontidão para um projeto que tem zero.** O
EngineOS tem 0 usuários de beta e 0 comunidade. A analogia que talvez esteja implicitamente
sustentando a espera não se aplica: ele adiou o *acesso*, você adiou a *existência*.

**Zed** (zed.dev/blog, "Zed is now open source", **2024-01-24**). Um time financiado, com um editor
já funcionando e usuários pagantes — muito mais a proteger que você — abriu o código pelo motivo que
falta aqui, dito com estas palavras: "we want to massively grow adoption in 2024 so that more
developers can benefit from Zed" e "Considering that all of Zed's users are programmers, it makes
the most sense to open Zed to the maximum pool of talent". A abertura não foi o prêmio pela
qualidade atingida; foi declaradamente o **mecanismo** para atingi-la: "we believe that making Zed
open source will make it the best product."

Leitura da lente 3: **os praticantes que deram certo trataram visibilidade como insumo da
qualidade, não como recompensa por ela.** A sua ordenação está invertida — e é a inversão que
justifica cada semana de espera, porque enquanto visibilidade é recompensa, sempre falta um pouco
para merecê-la.

As três lentes discordam entre si (permanente-vs-recuperável; conforto disfarçado de diligência;
visibilidade como insumo). Portanto a decisão está de fato bloqueada — não é um caso em que a
análise revela que nunca houve bloqueio.

---

## STEP 3 — O critério único

Uma frase. Sem "depende". Sem "e". Sem ambiguidade.

> ## **Esta hora de trabalho muda se alguém além de mim consegue rodar o EngineOS nesta semana?**

Sim → faça. Não → não é trabalho no EngineOS-produto, é trabalho no EngineOS-instrumento; e você
precisa saber qual dos dois está construindo antes de gastar a hora.

Aplicado às suas opções reais, o resultado é inequívoco em todos os casos — sem nenhuma zona
cinzenta:

| O que você poderia fazer com as próximas horas | Passa? |
|---|---|
| Tornar o repositório público (destrava `README.md:18` e `README.md:24-25`) | **Sim** |
| `git add install.ps1` e commitar | **Sim** |
| Pedir a um colega da Spesia para rodar o instalador numa máquina que não é sua | **Sim** |
| Corrigir `README.md:116` para a convenção real pós-02/07 | **Sim** |
| Escrever o ADR que registra a reversão do non-goal de `docs/PRD.md:29` | **Sim** |
| Construir o 19º agente, a 13ª regra, um coordinator de Flutter | **Não** |
| Refinar a doutrina de fan-out, os tiers de modelo, o roteador | **Não** |
| Preencher `.engineos/memory/` para o seu próprio uso | **Não** |
| Rodar mais três modos de análise estratégica | **Não** |

Note o que o critério faz e o que ele não faz. Ele **não** manda publicar. Ele não diz qual dos
dois EngineOS é o certo — instrumento pessoal privado é uma resposta completamente legítima, e uma
escolha respeitável. O que ele torna impossível é continuar sem responder: com esse critério na
mão, cada hora que falha no teste passa a ser uma escolha explícita em vez de uma pergunta adiada.
Ele responde ao seu quarto desfecho — "o que parar de fazer" — sem que eu precise nomear uma única
coisa a parar. O corte é feito pelo critério, e a decisão continua sendo sua.

---

## The one action

Neste modo, a ação **é o ato de aplicar o critério** — não uma tarefa a executar.

**Antes do próximo commit neste repositório, e no máximo até 2026-08-06:** aplique a frase acima ao
trabalho que você já ia fazer em seguida, e escreva a resposta — sim ou não — no registro de
mudança correspondente em `.engineos/changes/`. Uma vez. Uma linha.

**Sinal observável de que funcionou** — dentro de 7 dias, uma das duas coisas existe (não escolho
qual; as duas são clareza, e uma delas é o desfecho que você pediu):

- **(a)** uma pessoa além de você rodou o EngineOS — verificável por um segundo nome em
  `git shortlog -sn`, ou por `https://api.github.com/repos/ricardofagmer/engineer-spec-ia-pattern`
  retornando **200** em vez de 404, ou por um colega confirmando a instalação; **ou**
- **(b)** existe um ADR em `docs/adr/` — diretório que **hoje não existe** — declarando o EngineOS
  um instrumento pessoal privado, o que aposenta explicitamente o escopo de time de `docs/PRD.md:4`,
  os dois caminhos de instalação de `README.md:18` e `README.md:24-25`, e a postura de distribuição
  MIT de `LICENSE` + `.claude-plugin/plugin.json:11`.

**Sinal de fracasso**, igualmente observável: em 2026-08-06 o commit mais recente é uma 19ª feature,
e nem (a) nem (b) existe. Nesse caso o diagnóstico deste relatório se confirmou por outro caminho.

Antes de (a), duas verificações que são suas e que este relatório não pode fazer: o histórico git
está limpo de segredos (UNKNOWN item 5 — verificável em minutos), e o seu contrato de trabalho
permite publicar (UNKNOWN item 2 — **não é orientação jurídica**; leia o contrato, e se houver
dúvida fale com um advogado ou com o RH da Spesia, não com um agente).

---

## What would falsify this

Este relatório está errado, e deve ser rerodado, se qualquer uma destas observações for verdadeira:

1. **Alguém além de você já rodou o EngineOS.** Se um colega instalou a partir de um clone
   compartilhado, então "zero adotantes estruturais" cai e o diagnóstico de medo-de-exposição cai
   com ele: o produto já foi testado socialmente, e o bloqueio real é sobre escala ou monetização,
   não sobre exposição. Verificação: pergunte. É uma mensagem.
2. **Existe uma restrição dura à publicação** — cláusula de PI ou exclusividade no contrato
   cobrindo explicitamente este trabalho, ou um segredo não removido do histórico git. Nesse caso o
   bloqueio é **informação/restrição**, não medo, e o critério deve ser precedido por "isto pode
   legalmente e seguramente ser publicado?". Isso reordena o relatório inteiro, não apenas o
   ajusta.
3. **Você aplica o critério, decide conscientemente trabalhar em coisas que falham nele, e consegue
   dizer por quê em uma frase.** Então é conflito de valores assumido, não evitação — o diagnóstico
   do STEP 1 estava errado, e o que você precisa é rankear valores, não bordar o downside.
4. **`docs/PRD.md:4` era aspiracional desde o início** e você nunca quis adotantes. Então três dos
   quatro desfechos selecionados (dinheiro, reputação, adotantes) foram selecionados por hábito, e
   a única pergunta verdadeira sempre foi a quarta — clareza —, que este critério já responde.
5. **Um segundo autor aparece em `git shortlog` sem que nada tenha sido publicado.** Isso provaria
   um canal de distribuição privado que este relatório não conhece, e a premissa de "canal fechado"
   do grounding brief §3 precisaria ser refeita.

---

### Nota de escopo

Modo `decision`, per `skills/strategy/references/03-decision-unblock.md`. A decisão analisada é de
produto e de exposição pessoal, não técnica — se em algum momento ela virar uma escolha técnica
entre alternativas, ela pertence à skill `adr`, e não a este modo. Nada aqui é orientação
financeira, jurídica ou de carreira profissional. Os fatos verificáveis afirmados — o repositório é
privado (HTTP 404 reverificado em 2026-07-30), os dois caminhos de instalação documentados não
funcionam para terceiros, `install.ps1` não está versionado, `docs/adr/` não existe — são
informação, não recomendação.
