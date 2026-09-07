---
name: 2026-09-07-e01-baseline-e02-packaging
status: active
owner: Ricardo Fagmer
spec: n/a — execução direta dos épicos E01/E02 do plano "EngineOS 2.0 — Plano de adequação para produção" (06/09/2026, revisão 2)
domain: devops
---

## What

Estabelece a baseline do snapshot canônico, normaliza o fim de linha de todo o texto rastreado, publica a matriz de capacidades com evidência e cria o primeiro caminho de empacotamento reproduzível com manifesto, checksum e verificação sobre os bytes finais da release.

## Why

O plano de adequação apontava três problemas P0 que se confirmaram na inspeção do repositório:

1. **Fim de linha (item 3 da análise).** `.gitattributes` cobria apenas `*.sh` e `dist/engineos.cjs`. Todo o restante ficava com `eol` não especificado, então um checkout em Windows convertia 509 arquivos para CRLF. Medida antes da correção: `git diff --shortstat` = 512 arquivos / 87.071 inserções; `git diff --ignore-cr-at-eol --shortstat` = 1 arquivo / 222 inserções. Ou seja, 99,8% do diff era ruído, e nenhuma revisão conseguia distinguir trabalho real de artefato de checkout. Os blobs do HEAD já estavam em LF — o problema era exclusivamente de checkout, não de conteúdo commitado.
2. **Artefato de distribuição (item 2).** Não existia nenhum caminho de empacotamento: nem script em `scripts/`, nem alvo em `package.json`. O ZIP distribuído era do working tree, por isso carregava dependências, caches e estado local.
3. **Versão e PRD divergentes (item 1).** `package.json`, `.claude-plugin/plugin.json` e `marketplace.json` estão consistentes em 1.6.0 — a divergência real é entre o código e o PRD, ainda em "Draft v1" de 11/06/2026, cujos *non-goals* contradizem o que o repositório já faz.

## Scope

- `.gitattributes` — política de fim de linha para todo formato de texto.
- 509 arquivos rastreados — working tree reconvertido para LF (sem mudança de conteúdo).
- `scripts/package-release.sh` — novo.
- `.github/workflows/ci.yml` — novo job `package` (ubuntu-latest, windows-latest).
- `.gitignore` — `dist-release/`.
- `docs/CAPABILITIES.md` — novo.
- `docs/PRD.md` — aviso de desatualização e ponteiro para a matriz.

## Checklist

- [x] Comparar working tree com HEAD distinguindo mudança semântica de fim de linha
- [x] Definir LF nos formatos consumidos pelos parsers, preservando CRLF onde a plataforma exige
- [x] Gerar pacote a partir de um commit por allowlist explícita
- [x] Gerar manifesto e checksum
- [x] Verificar CRLF, bit de execução, dependências, caches, segredos e lockfiles sobre os bytes finais
- [x] Testar extração → instalação limpa → validate → typecheck → testes
- [x] Publicar matriz de capacidades com estado e evidência por capacidade
- [x] Registrar divergências do PRD
- [ ] Reescrever o escopo do PRD (decisão do responsável pelo produto)
- [x] Mapa de compatibilidade: plataformas suportadas, pré-requisitos e os três pontos de aplicação da política de fim de linha
- [x] Registrar ADRs de contrato de configuração, política de aprovação e critérios de separação de serviços
- [x] Fechar a política de portabilidade com checks (`C32` paridade de espelhos, `C33` fim de linha)
- [ ] Consolidar release notes
- [ ] Fixar SLO, RPO, RTO, retenção e orçamento por perfil de implantação

## What was made

`.gitattributes` passou a declarar `* text=auto eol=lf` com exceções explícitas: `*.ps1` em CRLF (host Windows, não consumido por parser POSIX) e binários marcados como `binary`. O working tree foi reconvertido para LF nos 509 arquivos afetados; nenhum blob mudou de hash.

`scripts/package-release.sh` empacota a partir de um **commit** via `git archive`, nunca do working tree, usando allowlist explícita de caminhos. Verifica sobre os bytes finais: ausência de CRLF nos formatos POSIX, bit de execução coerente (scripts executáveis; bibliotecas carregadas com `source` sem o bit), ausência de `node_modules`, `.next`, `build`, bancos, `.env`, chaves e certificados, varredura de segredos, presença dos lockfiles e dos entrypoints do instalador. Emite `MANIFEST.txt` com sha256 por arquivo e `.zip.sha256` do pacote. Recusa empacotar se `package.json` e `.claude-plugin/plugin.json` declararem versões diferentes.

A allowlist expôs uma dependência real que o plano não previa: quatro checks do `validate-engineos.sh` leem `.engineos/{README,archived/README,changes/README,changes/_template}.md`. Esses arquivos são ativo de runtime, não histórico de desenvolvimento, e entram no pacote; o restante de `.engineos/` fica de fora.

O job `package` da CI roda em ubuntu-latest e windows-latest e falha se o checkout divergir do HEAD — é a regressão automatizada de CRLF/permissões que o plano exige, e ela roda antes de qualquer outra coisa.

`docs/CAPABILITIES.md` classifica cada capacidade como disponível, parcial ou planejada, com implementação, evidência e épico da lacuna, mais os gates por perfil de implantação.

## Verification

Sobre os bytes finais de `dist-release/engineos-1.6.0-99b5eec.zip` (344 arquivos), extraídos em diretório limpo:

- `scripts/validate-engineos.sh` — **108 passed, 0 failed**
- `npm ci` pelo lockfile — sucesso
- `npm run typecheck` — limpo
- `npm test` — **24/24**
- `sha256` do pacote: `a462fd2bad55b6c29566125cc4d638904a13bc96ee7acd00018d00e11fbc1d57`

Limitações declaradas, não convertidas em sucesso:

- O `install.sh` **não** foi executado: ele escreve em `~/.claude` e exige ambiente isolado. Só a sintaxe foi verificada (`bash -n`).
- macOS não foi testado e não está declarado suportado.
- A matriz de plataformas da CI ainda não teve uma execução real registrada — o job `package` foi adicionado nesta mudança.
- A varredura de segredos não encontrou achado, o que não é prova de ausência de segredo.
- Nenhum eval live foi executado; a coluna "Evals" da matriz permanece **parcial** por isso.
- No working tree em Windows, `validate-engineos.sh` reporta 107/1: as quatro bibliotecas `hooks/lib-*.sh`, `layout-manifest.sh` e `scaffold-layout.sh` aparecem com bit de execução porque o filesystem montado reporta todos os arquivos como executáveis. No git elas são `100644` e no pacote saem corretas — por isso o artefato passa onde o working tree falha. É artefato de plataforma, não defeito.

## Human decisions

<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
2026-09-07 | Ricardo Fagmer | escopo de execução | aprovado | Escolheu executar E01-a (normalização de EOL), E01-b (baseline e PRD) e E02 (script de release) nesta sessão, entre as opções apresentadas.
2026-09-07 | Ricardo Fagmer | permissão de escrita | aprovado | Autorizou exclusão de arquivos na pasta do projeto para que o git pudesse gravar o índice (`.git/index.lock` órfão de 06/09 impedia qualquer commit).

## Changes registered

```
git log --oneline fed9a63..HEAD
  99b5eec chore(e01): normalizar fim de linha para todo texto rastreado
  d82245c feat(e02): empacotamento reproduzivel com manifesto, checksum e matriz de CI
```

Pendente de commit nesta mudança: `docs/CAPABILITIES.md`, `docs/PRD.md`, este registro.

Fora do escopo, deixado intocado no working tree: `skills-lock.json` (+222 linhas, única mudança semântica preexistente) e ~20 skills não rastreadas em `.agents/skills/`, `.trae/`, `.windsurf/` — decisão de escopo pendente.

## Segunda unidade — fechamento de E01 (mesma sessão)

`scripts/checks/80-portability.sh` acrescenta dois checks. `C32` afirma que `.agents/skills`, `.trae/skills` e `.windsurf/skills` são byte a byte idênticos — eram, mas nada garantia; agora um commit que edita um espelho e esquece os outros falha. `C33` audita 571 arquivos de texto POSIX rastreados e é a regressão que impede a política de fim de linha de voltar a se soltar. Ambos usam o índice do git como fonte quando há repositório e a árvore quando não há, para rodarem também sobre o pacote extraído.

`C33` encontrou, no primeiro run, `.claude/worktrees/` — duas worktrees de agente `prunable`, 3,4 MB, dentro do repositório, não rastreadas e **não ignoradas**. É a evidência concreta do item 2 da análise ("ZIP inclui worktree e estado"). O `git archive` já as excluía por serem não rastreadas, então o artefato nunca esteve comprometido; `.gitignore` passou a cobrir `.claude/worktrees/` e `.claude/settings.local.json` para que também não sujem o `git status` nem sejam commitadas por descuido.

`docs/COMPATIBILITY.md` ganhou a matriz de plataformas (Linux e Windows/Git Bash suportados; macOS não; `install.ps1` parcial), os pré-requisitos com o que acontece na ausência de cada um — em especial: **sem `jq`, os hooks não são registrados e a instalação tem regras, não gates** — e a tabela dos três pontos de aplicação da política de fim de linha.

Quatro ADRs. `release-from-commit-with-allowlist` (accepted) registra a decisão de E02 com a denylist via `export-ignore` como alternativa rejeitada. `versioned-config-contract`, `approval-bound-to-effect` e `when-to-split-a-service` ficam em **proposed**: descrevem contratos de E03/E04/E09 ainda não implementados, e enquanto estiverem nesse estado o comportamento correspondente não pode ser anunciado.

Uma escolha de projeto que vale registrar: `C32` audita o que está versionado, não a árvore inteira. Na primeira versão ele auditava o filesystem e reportou 200 divergências — as ~100 skills não rastreadas em `.agents/skills/`, que existem só ali. Isso é decisão de escopo pendente, não defeito de sincronismo; um check que fica vermelho por trabalho em andamento ensina a ignorar checks.

Verificação desta unidade: `validate-engineos.sh` **109 passed, 1 failed** no working tree — a falha é o artefato de plataforma já descrito (bit de execução das quatro bibliotecas em filesystem Windows).

## Notes

- A ordem importou: sem a normalização de EOL, nenhuma das outras verificações teria sinal. Um repositório que reporta 512 arquivos modificados não permite revisar nada.
- O empacotador recusa versões divergentes entre `package.json` e `plugin.json` por construção. Quando 2.0 for publicado, os dois têm de subir juntos — o gate já existe.
- Próxima unidade, conforme o plano: fechar E01 com as ADRs e o mapa de compatibilidade, depois E03 (console íntegro) e os contratos de E04/E10.
