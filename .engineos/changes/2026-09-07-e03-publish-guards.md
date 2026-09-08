---
name: 2026-09-07-e03-publish-guards
status: active
owner: Ricardo Fagmer
spec: n/a — execução do épico E03 do plano "EngineOS 2.0 — Plano de adequação para produção" (06/09/2026, revisão 2), critério de aceite "uma alteração concorrente ou inválida não sobrescreve trabalho existente"
domain: frontend
---

## What

Publicação e rollback do console deixam de poder destruir trabalho que não é deles: guarda de revisão base por arquivo, lock de escrita entre processos, recusa de rollback sobre arquivo sujo, e o console entra na CI.

## Why

O console edita uma **cópia**. `writeSkills` preservava as linhas não tocadas do arquivo byte a byte — o que parecia cuidado suficiente e não era. Entre a captura do draft e o clique em Publicar, o arquivo pode ser editado à mão, por outra sessão do console ou por uma operação de git; a descrição do draft então sobrescrevia a nova, **sem erro, sem diff e sem rastro**. É a pior forma de perda de dados: ninguém fica sabendo.

Três variantes do mesmo problema estavam abertas:

1. **Nenhuma revisão base.** Não havia como perguntar "este arquivo ainda é aquele contra o qual eu editei?".
2. **Nenhuma serialização.** Dois `POST /api/publish` podem se intercalar — um duplo clique em Publicar basta. Dois pares `git add`/`git commit` disputando produzem commit com metade dos arquivos do outro request, ou um erro opaco de `index.lock` bem depois de o disco já ter sido tocado.
3. **Rollback sobre árvore suja.** `git revert` ou aborta ou para no meio de um conflito, e nos dois casos o que está em risco é a edição não commitada do operador.

E o quarto, que explica os três: **a CI não tocava no console.** Nenhum `grep console .github/workflows/ci.yml` retornava nada. Typecheck, lint e build rodavam só na máquina de quem editasse, e testes não existiam. Superfície que escreve no repositório e faz commit, sem verificação automatizada, é onde perda de trabalho nasce.

## Scope

- `console/src/lib/entities/types.ts` — campo `baseHash`.
- `console/src/lib/entities/skills.ts` — `hashSource`, `detectBaseConflicts`, recusa em `writeSkills`.
- `console/src/lib/publish-lock.ts` — novo.
- `console/src/lib/git.ts` — `pathsInCommit`, `dirtyPaths`.
- `console/src/app/api/publish/route.ts`, `console/src/app/api/rollback/[historyId]/route.ts`.
- `console/tsconfig.test.json`, `console/package.json` (script `test`), dois arquivos de teste.
- `.github/workflows/ci.yml` — job `console`.
- `docs/CAPABILITIES.md`.

## Checklist

- [x] Registrar a revisão base de cada draft por hash de conteúdo
- [x] Recusar publicação quando o arquivo mudou desde a captura, nomeando os arquivos
- [x] Tratar draft sem base registrada como desconhecido, não como confiável
- [x] Serializar publicações concorrentes, inclusive entre processos
- [x] Recusar rollback sobre arquivo com alteração não commitada
- [x] Rebasear os drafts publicados para os bytes recém-escritos
- [x] Testes de comportamento das guardas
- [x] Console na CI: typecheck, lint, testes e build
- [ ] Entidades editáveis de agentes, modelos, MCPs, routing e regras
- [ ] Precedência ação → rota → agente → skill → padrão, com conflito exigindo resolução explícita
- [ ] Configuração efetiva com origem de cada escolha e simulação de rota antes de publicar
- [ ] Autenticação, RBAC e isolamento antes de hospedar

## What was made

**Revisão base.** Cada draft carrega o sha256 do arquivo como ele estava quando o conteúdo foi capturado. Hash, não mtime: mtime se move quando uma ferramenta reescreve conteúdo idêntico e não se move em alguns filesystems dentro do mesmo segundo — nas duas direções ele responde a pergunta errada. A publicação chama `detectBaseConflicts` **antes** de validar e antes de qualquer escrita, e recusa nomeando os arquivos. `writeSkills` recusa de novo por conta própria: um chamador futuro não deve conseguir reintroduzir o caminho de sobrescrita silenciosa só esquecendo a pré-checagem.

Draft sem `baseHash` — linhas gravadas antes da guarda existir — é recusado como base desconhecida. É a leitura fail-closed, e o `GET` **não** regrava a base de um draft existente: fazer isso aceitaria automaticamente o que estiver no disco agora e anularia a guarda inteira.

Publicação bem-sucedida rebaseia os drafts para os bytes que acabou de escrever, senão a segunda publicação do mesmo draft conflitaria com o arquivo que a primeira gravou — a guarda disparando contra o próprio sucesso do operador.

**Lock.** `mkdir` é a única primitiva atômica e fail-if-exists em toda plataforma onde isto roda, sem dependência, e — a parte que uma flag em memória não dá — exclui também uma **segunda instância** do console apontada para o mesmo repositório, que é precisamente o caso de publicação concorrente. Publicação e rollback tomam o mesmo lock, e ele é liberado mesmo quando o corpo lança: uma publicação que falha não pode travar todas as seguintes.

Staleness por idade, não por checagem de pid: um pid não distingue processo morto de processo em outra máquina compartilhando o diretório, e errar aí significa quebrar uma publicação viva.

**Rollback.** Antes de reverter, lista os caminhos do commit e recusa se algum tiver alteração não commitada. Depois do revert, ressincroniza o snapshot do disco; um draft que ainda segure a base pré-revert será recusado pela guarda de publicação, e esse é o resultado correto — o arquivo contra o qual ele foi editado não existe mais.

## Verification

- `console: npm test` — **12 passed, 0 failed** (6 casos da guarda de base, 6 do lock).
- `console: npx tsc --noEmit` limpo; `npx eslint .` limpo.
- `scripts/validate-engineos.sh` e `scripts/test-kernel.sh` inalterados por esta mudança e verificados de novo sobre o pacote.

Um dos testes encontrou um defeito no código que ele testava, e vale registrar porque é o tipo de erro que só aparece assim: `acquire` lia o arquivo `owner` e calculava a idade do lock no **mesmo** `try`. Um lock sem `owner` — processo morto entre o `mkdir` e a escrita — lançava antes de a idade ser calculada, caía no default de idade 0 e **nunca podia ser reclamado**. O lock meio criado era o único caso para o qual a regra de staleness existia, e era o único que ela não cobria. Corrigido separando as duas leituras; há teste para ele.

Limitações declaradas:

- `npm run build` do console **não** foi executado nesta máquina: o `next build` baixa o binário SWC e a rede desta sessão recusou. Typecheck, lint e testes passam; o build roda no job `console` da CI, que também não teve execução real ainda.
- As guardas cobrem a vertical de skills, a única que existe. Cada entidade nova precisa entrar em `detectBaseConflicts` — não há nada que force isso ainda.
- Os handlers de rota não têm teste: são orquestração sobre os módulos testados, e testá-los exigiria subir o Next. `tsconfig.test.json` compila só `src/lib/entities` e `publish-lock`, deixando de fora o `store/` (seam do better-sqlite3, usa `import.meta`).
- Continua sem autenticação, RBAC ou isolamento: o console segue não hospedável.

## Human decisions

<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
2026-09-07 | Ricardo Fagmer | escopo de execução | aprovado | "Go ahead" sobre a continuação de E03. Fatia escolhida pelo critério de aceite do próprio épico — "uma alteração concorrente ou inválida não sobrescreve trabalho existente" — que era o único item de E03 com risco de perda de dados.

## Changes registered

Commit desta unidade na branch `chore/e01-eol-baseline`, imediatamente após `9843fa1`.

## Notes

- Ordem, de novo: acrescentar entidades editáveis antes destas guardas teria multiplicado por cinco a superfície capaz de sobrescrever trabalho em silêncio.
- Padrão a reter: **quando a UI edita uma cópia, a identidade da origem faz parte do draft** — sem ela não existe conflito, existe só o último a gravar. [[draft-precisa-de-base]]
