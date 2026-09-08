---
name: 2026-09-07-e03-agents-models-effective
status: active
owner: Ricardo Fagmer
spec: n/a — execução do épico E03 do plano "EngineOS 2.0 — Plano de adequação para produção" (06/09/2026, revisão 2), item "implementar agentes, modelos, MCPs, routing e regras, além das skills" e "mostrar configuração efetiva, origem de cada escolha e simulação da rota antes de publicar"
domain: frontend
---

## What

Agentes e modelos passam a existir como entidades no console, em **leitura**, com relações reais. E `GET /api/effective` mostra a configuração efetiva chamando o kernel — o mesmo binário que os hooks chamam.

## Why

O console tinha uma vertical de cinco. A verticalização das outras quatro era o item 1 de E03.

A decisão de escopo que importa aqui é o que **não** foi feito: agentes e modelos entraram **sem interruptor de habilitação**. Adicionar `enabled` a um agente hoje recriaria exatamente o defeito consertado horas antes — um campo que o runtime não lê, apresentado na interface como controle. Interruptor entra depois que o runtime o honra, nunca antes. Modelos têm ainda uma razão própria: a tabela de tiers é conferida contra `rules/models.md` por um check de integridade, então editá-la aqui sem mover a prosa deixaria o check vermelho em vez de mudar comportamento.

`/api/effective` fecha a outra metade: mostrar o que o sistema **vai fazer**, não o que a configuração parece dizer.

## Scope

- `console/src/lib/entities/frontmatter.ts` — extraído de `skills.ts`, agora compartilhado.
- `console/src/lib/entities/agents.ts`, `models.ts` — novos.
- `console/src/lib/entities/relations.ts` — `resolveAgentRelations` e as fontes que ela precisa.
- `console/src/lib/entities/types.ts` — `AgentEntity`, `ModelEntity`.
- `console/src/lib/kernel.ts` — novo, seam sobre `scripts/kernel.sh`.
- `console/src/app/api/{agents,models,effective}/route.ts` — novos.
- Quatro arquivos de teste; `docs/CAPABILITIES.md`.

## Checklist

- [x] Leitor de frontmatter compartilhado, para skills e agentes não divergirem de dialeto
- [x] Entidade de agente a partir de `agents/*.md`, com relações reais
- [x] Entidade de modelo a partir de `registries/models.json`, com back-reference de agentes
- [x] Configuração efetiva e simulação de rota pelo kernel, com origem de cada escolha
- [x] Testes de comportamento das duas entidades
- [ ] MCPs, routing e regras como entidades
- [ ] Tornar agentes e modelos editáveis (exige mover a prosa espelhada na mesma transação)
- [ ] Precedência ação → rota → agente → skill → padrão, com conflito exigindo resolução explícita
- [ ] Telas para as entidades novas — hoje só existem as APIs
- [ ] Autenticação, RBAC e isolamento antes de hospedar

## What was made

**Leitor compartilhado.** O parser de frontmatter era privado de `skills.ts`. Agentes usam o mesmo dialeto, e uma segunda cópia escrita à mão derivaria: os dois leitores acabariam discordando sobre aspas ou sobre onde o bloco termina, e o console mostraria uma coisa enquanto o runtime lia outra.

**Agentes.** A fonte é a frontmatter de `agents/*.md`, não `registries/agents.json` — o cabeçalho daquele arquivo diz que ele é gerado por `scripts/gen-agent-registry.sh` e não deve ser editado à mão. Ler a cópia gerada mostraria ao console um retrato que pode estar velho em relação aos arquivos que o operador está olhando.

O alias custou uma correção que vale registrar. A leitura óbvia — uma chave `alias:` na frontmatter — **retornaria null para os 22 agentes**, porque essa chave não existe em nenhum arquivo deste repositório: o gerador extrai o alias do texto literal `Alias: <slug>` dentro do bloco, e hoje ele vive no fim de cada `description:`. Eu tinha escrito a versão óbvia; a execução contra a árvore real mostrou 22 nulls, que é o mesmo defeito de campo-sempre-vazio que esta vertical existe para parar de repetir. Corrigido espelhando a regra do gerador: **19 aliases, exatamente os 19 que a registry gerada carrega.**

**Modelos.** Um tier por entidade, com o modelo, o alvo de escalada, os work types roteados e os agentes que o declaram. Resolvido contra a árvore real: `build` com 16 agentes, `design` com 5, `most-capable` com 1, `cheap` com nenhum.

**Configuração efetiva.** `console/src/lib/kernel.ts` chama `scripts/kernel.sh` com `execFile` e argv em array — os argumentos são caminho e prompt fornecidos pelo operador. `GET /api/effective` devolve `route-path`, `resolve-task` e `skill-state` junto com a origem de cada parte. Skills suprimidas aparecem como suprimidas, com o motivo.

## Verification

- `console: npm test` — **20 passed, 0 failed** (12 antes; 8 casos novos entre agentes e modelos).
- `console: npx tsc --noEmit` e `npx eslint .` limpos.
- Execução contra a árvore real: 22 agentes, 0 com erro de parse, 19 com alias — conferindo com `jq '[.agents[]|select(.alias!=null)]|length' registries/agents.json` = 19. Quatro tiers com contagens reais.
- Seam do kernel exercitado: `route-path` de um controller devolve domínio `backend`, cinco regras, `nestjs-patterns` e o agente; `resolve-task` devolve o par `skills`/`skills_suppressed`; `skill-state` devolve `["strategy"]`; um caminho vazio vira `KernelError` tratado, não exceção crua.

Limitações declaradas:

- **Não há tela para nada disso** — só as APIs. Um operador ainda não vê agentes, modelos nem configuração efetiva no console.
- `npm run build` continua sem execução local (o `next build` baixa o binário SWC e a rede desta sessão recusa). Roda no job `console` da CI, que ainda não teve execução real.
- Agentes e modelos são leitura. Nada força uma entidade nova a entrar em `detectBaseConflicts` quando virarem editáveis.
- Nada verifica automaticamente que `parseAgents` e `gen-agent-registry.sh` continuam concordando; a conferência dos 19 aliases foi manual, nesta sessão. Um check de drift entre os dois exigiria node e as dependências do console dentro do harness de checks.
- MCPs, routing e regras seguem sem entidade. E03 continua **parcial**.

## Human decisions

<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
2026-09-07 | Ricardo Fagmer | escopo de execução | aprovado | "go ahead" sobre a continuação de E03. Verticalização escolhida como próximo item; leitura em vez de edição decidida pela evidência da unidade anterior — um interruptor sem leitor no runtime é o defeito que acabara de ser consertado.

## Changes registered

Commit desta unidade na branch `chore/e01-eol-baseline`, imediatamente após `92b249f`.

## Notes

- Terceira vez na mesma sessão que a execução contra dados reais desmentiu a leitura óbvia do código: o `enabled` sem leitor, o lock meio criado que nunca era reclamado, e agora o alias que não é uma chave. Rodar contra a árvore real, e não só contra fixtures, é o que encontrou os três.
- Padrão a reter: **quando um campo é derivado por um gerador, a regra do gerador é a especificação** — reimplementar a leitura "do jeito que faria sentido" produz um segundo significado para o mesmo nome. [[espelhar-o-gerador]]
