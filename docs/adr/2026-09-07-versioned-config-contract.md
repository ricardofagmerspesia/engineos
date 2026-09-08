# Contrato de configuração versionada entre console e runner

Date: 2026-09-07
Status: proposed

Source: "EngineOS 2.0 — Plano de adequação para produção" (06/09/2026, rev. 2), épicos E01 (contrato de configuração), E03 (publicação e rollback) e E04 (fixar versão por execução).

## Context

Hoje o console grava arquivos e o runtime lê arquivos. Não há nome para "a configuração que estava valendo quando esta execução rodou". As consequências aparecem em três lugares distintos que na verdade são o mesmo problema:

- Uma publicação no meio de uma execução muda o comportamento dela pela metade, e nada registra isso.
- Um rollback não tem como saber se descarta trabalho que outro operador acabou de gravar — o console já implementa `publish`, `diff`, `history` e `rollback` sobre arquivos, sem revisão base.
- Um trace de telemetria não consegue responder "com qual política esta decisão foi tomada?", que é a primeira pergunta de qualquer investigação de incidente.

O kernel já é determinístico: fatos declarados entram, decisão estruturada sai, sem efeito externo. O que falta não é determinismo, é **identidade** da entrada.

## Options considered

1. **`config_version` imutável, com hash do conteúdo, fixada por execução** (escolhida).
   - Pros: uma execução declara sua versão no início e a carrega até o fim — o resultado é reproduzível e explicável; publicação concorrente compara contra a revisão base e falha em vez de sobrescrever; o rollback vira "publicar a versão N de novo", não "desfazer arquivos"; telemetria e evals podem versionar resultados por configuração, que é pré-requisito para comparar antes/depois em E06.
   - Cons: exige uma tabela de versões e um ponto de serialização das publicações; uma execução longa pode terminar com política antiga — o que é uma propriedade desejada, não um bug, mas precisa ser dito ao operador.

2. **Ler os arquivos a cada decisão (estado atual)** (rejeitada).
   - Pros: nenhuma infraestrutura; mudança tem efeito imediato.
   - Cons: efeito imediato *no meio de uma execução* é precisamente o modo de falha. Uma tarefa que passou por `admit` sob um orçamento e chama o modelo sob outro não tem comportamento definido, e nenhum trace consegue explicar o que aconteceu.

3. **Commit do git como a versão** (rejeitada).
   - Pros: já existe, já tem hash, já tem histórico.
   - Cons: amarra publicação a commit, o que impede o console de publicar sem escrever no repositório e torna o perfil hospedado dependente de credencial de git. Além disso, nem toda configuração efetiva vem de arquivo versionado — a resolução final depende de precedência (ação → rota → agente → skill → padrão) e é a *resolvida* que precisa de identidade. O commit continua sendo registrado como proveniência, não como identidade.

## Decision

Opção 1. A configuração publicada é imutável e endereçada por `config_version` (monotônica) mais o hash do conteúdo resolvido. O contrato mínimo de uma publicação é `{config_version, base_hash, autor, alterações, timestamp}`.

Regras que decorrem:

- **O runner fixa a versão no início da execução** e não a troca. `run_id` carrega `config_version`.
- **Publicação é condicional à revisão base.** Se `base_hash` não bate com o estado atual, a publicação falha e mostra o conflito. Publicações concorrentes são serializadas.
- **Rollback publica uma versão anterior como versão nova.** Nunca reescreve o histórico e nunca descarta gravação alheia sem conflito explícito.
- **Escrita em arquivo, commit e snapshot do banco são coordenados.** Falha entre etapas deixa uma operação recuperável registrada, não um estado meio-gravado.
- **`config_version` aparece em trace, eval e registro de aprovação.** Sem isso, nenhuma comparação antes/depois de E06 é interpretável.

## Consequences

- `config_version` passa a ser superfície pública sob `docs/COMPATIBILITY.md`.
- Uma aprovação humana é válida para uma `config_version`; ver `2026-09-07-approval-bound-to-effect.md`.
- Execução longa pode terminar sob política antiga. É a garantia, e o operador precisa poder ver isso — não é motivo para trocar a versão no meio.
- Enquanto E03/E04 não implementarem isto, "desabilitar no console" **não** é enforcement e não deve ser anunciado como tal (ver `docs/CAPABILITIES.md`).
