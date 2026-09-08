---
name: 2026-09-07-e03-skill-enablement
status: active
owner: Ricardo Fagmer
spec: n/a — execução do épico E03 do plano "EngineOS 2.0 — Plano de adequação para produção" (06/09/2026, revisão 2), item "comprovar que enabled=false é respeitado pelo adapter/runner"
domain: llm
---

## What

Faz `enabled: false` chegar ao runtime. O kernel passa a resolver a habilitação de skills, deixa de recomendar as desabilitadas nos três lugares onde responde sobre skills, e diz por que suprimiu. O console passa a resolver relações reais em vez de listas vazias fixas.

## Why

O plano pedia para "comprovar que `enabled=false` é respeitado pelo adapter/runner". A inspeção mostrou que não havia o que comprovar:

```
grep -rn "enabled" --include='*.sh' --include='*.json' --include='*.ts' scripts hooks registries src
(nenhum resultado)
```

**Nada fora do console lia o campo.** Desabilitar uma skill mudava um arquivo e mais nada — e a interface apresentava como controle algo que não controlava coisa alguma. Um controle assim é pior que a ausência dele: o operador acredita ter desligado e não desligou.

Havia um caso concreto no repositório: `skills/strategy/SKILL.md` já declarava `enabled: false`, e a skill continuava sendo recomendada por qualquer answer que a citasse.

O segundo achado é do mesmo tipo. `SkillEntity.usedByAgents` e `.dependsOnRules` eram `[]` fixos, com um comentário dizendo que o ticket de Agents os preencheria. O único caminho de *warn* da validação — "desabilitar esta skill afeta N agente(s)" — não podia disparar nunca, porque a lista era sempre vazia. O console deixava desabilitar uma skill que três agentes nomeiam e não dizia nada. Uma relação sempre vazia é pior que um campo ausente: a interface a apresenta como resposta.

## Scope

- `scripts/kernel.sh` — resolvedor de habilitação, subcomando `skill-state`, filtro em `route-path`, `route-intent` e `resolve-task`.
- `scripts/test-kernel.sh` — 14 casos novos.
- `scripts/checks/85-skill-enablement.sh` — novo, checks `C34` e `C35`.
- `console/src/lib/entities/relations.ts` — novo.
- `console/src/lib/entities/skills.ts`, `console/src/app/api/skills/route.ts`.
- `docs/COMPATIBILITY.md`, `docs/CAPABILITIES.md`.

## Checklist

- [x] Resolver habilitação a partir da frontmatter, com ausência do campo significando habilitada
- [x] Suprimir skill desabilitada nos três sítios de resposta, dizendo o motivo
- [x] Expor a resolução como answer própria (`skill-state`) para console, check e hook lerem o mesmo
- [x] Testes de comportamento, incluindo os casos negativos
- [x] Checks de fronteira com regressão plantada verificada
- [x] Relações reais no console, ativando o caminho de warn da validação
- [x] Documentar o limite: o que o interruptor bloqueia e o que não bloqueia
- [ ] Release note da MINOR (`skills_suppressed` e `skill-state` são superfície nova)
- [ ] Entidades editáveis de agentes, modelos, MCPs, routing e regras no console
- [ ] Precedência ação → rota → agente → skill → padrão, com conflito exigindo resolução explícita
- [ ] Publicação condicional à revisão base e serialização de publicações concorrentes
- [ ] Autenticação, RBAC e isolamento antes de hospedar o console

## What was made

**Kernel.** `skill_state_json()` lê a frontmatter de cada `skills/*/SKILL.md` uma vez por processo e produz um mapa `{id: bool}`. Só a primeira frontmatter é lida, e só quando o arquivo começa com ela: uma linha `enabled:` no corpo é documentação, não configuração, e não pode desligar uma skill. Ausência do campo significa habilitada — é o contrato do console e o que mantém funcionando toda skill escrita antes de o campo existir.

O filtro é aplicado em `route-path`, `route-intent` e `resolve-task`. Cada um monta o objeto de resposta por conta própria, então o filtro precisa estar nos três; `C34` existe justamente porque um quarto sítio adicionado sem ele devolveria a lista crua e o sintoma seria uma skill desabilitada aparecendo, não um erro.

A skill suprimida entra em `skills_suppressed` com `reason: "disabled"`. Não sai em silêncio: uma lista curta e uma lista filtrada são indistinguíveis para quem lê, e um controle cujo efeito não pode ser observado volta a ser decorativo por outro caminho.

`kernel.sh skill-state [--id <s>]` expõe a resolução sozinha, para que console, check e hook leiam a mesma coisa em vez de cada um reparsear frontmatter do seu jeito.

**Console.** `relations.ts` resolve `usedByAgents` por dois fundamentos independentes, e os dois são reais: uma registry que liga agente e skill ao mesmo domínio ou intent, e um agente cuja própria prosa nomeia a skill. Nenhum basta sozinho — as registries perdem o agente que invoca a skill diretamente, a prosa perde o agente ligado só por roteamento. `dependsOnRules` sai do corpo do SKILL.md. A correspondência é por token inteiro, nunca substring: `retro` não pode casar com "retrospective", porque isto alimenta um aviso sobre o qual o operador age, e um falso positivo aí ensina a ignorar o aviso.

`GET /api/skills` sobrepõe as relações frescas ao draft armazenado. Elas são derivadas, não editadas — um draft gravado antes de um agente passar a referenciar a skill continuaria afirmando que ninguém a usa, e o aviso de desabilitação ficaria mudo exatamente para a skill que mais precisa dele.

Resultado real da resolução: `nestjs-patterns` → `backend-coordinator` + `architecture,backend,data,observability`; `react-patterns` → `frontend-coordinator,mobile-coordinator`; `retro` → `git,memory,testing`.

## Verification

- `scripts/test-kernel.sh` — **348 passed, 0 failed** (334 antes; 14 casos novos).
- `scripts/validate-engineos.sh` — **111 passed, 1 failed**, sendo a falha o artefato de filesystem Windows já documentado.
- `C35` verificado com regressão plantada: desabilitando `nestjs-patterns` (única skill do domínio `backend`), o check falha nomeando o domínio esvaziado; restaurado o arquivo, volta a passar.
- Verificação ponta a ponta do enforcement, com `nestjs-patterns` desabilitada:
  `route-path` → `{"skills":[],"skills_suppressed":[{"id":"nestjs-patterns","reason":"disabled"}]}`;
  `resolve-task` → mesmo par em `task_contract`. Restaurado, ambos voltam a `["nestjs-patterns"]` e `[]`.
- `console: npx tsc --noEmit` limpo; `parseSkills` executado contra a árvore real produzindo as relações acima.

Limitações declaradas, não convertidas em sucesso:

- Isto é enforcement de **recomendação**, não de execução. EngineOS não impede alguém de invocar uma skill desabilitada pelo nome: a ferramenta Skill lê o diretório e não há hook entre as duas coisas. Bloqueio real exige desinstalar a skill. Está dito em `docs/COMPATIBILITY.md` e em `docs/CAPABILITIES.md`, e não deve ser suavizado em material de release.
- Os hooks ainda não consomem `skills_suppressed`; quem lê o par hoje é quem chama o kernel diretamente.
- Nenhuma das outras entidades de E03 (agentes, modelos, MCPs, routing, regras) foi implementada. O console continua **parcial**.
- Sem autenticação, RBAC ou isolamento: o console não pode ser hospedado.

## Human decisions

<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
2026-09-07 | Ricardo Fagmer | escopo de execução | aprovado | Instrução "Implemente" sobre a próxima unidade anunciada: completar as entidades do console e comprovar que `enabled=false` tem efeito no runtime. Escopo desta fatia decidido pela evidência: não havia o que comprovar, então o trabalho virou implementar o ponto de aplicação antes de acrescentar entidades sobre um campo sem efeito.

## Changes registered

Ver `git log --oneline` da branch `chore/e01-eol-baseline`; esta unidade é o commit de E03 imediatamente após `7ca8974`.

## Notes

- A ordem importou de novo. Acrescentar entidades de agentes e modelos ao console antes deste commit teria multiplicado interruptores sem efeito, em vez de consertar o que já existia.
- `skills_suppressed` e `skill-state` são superfície pública nova, portanto MINOR sob `docs/COMPATIBILITY.md`. A release note ainda não existe e está no checklist.
- Padrão que vale reter: **um campo de configuração sem leitor é uma promessa, não um controle** — e a forma de fechar a distância é um answer do kernel mais um check que afirme o par, não uma linha de documentação. [[config-sem-leitor]]
