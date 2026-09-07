# Empacotar a release a partir de um commit, por allowlist explícita

Date: 2026-09-07
Status: accepted

Source: "EngineOS 2.0 — Plano de adequação para produção" (06/09/2026, rev. 2), épico E02; baseline em `.engineos/changes/2026-09-07-e01-baseline-e02-packaging.md`.

## Context

Até 07/09/2026 o repositório não tinha caminho de empacotamento: nem script em `scripts/`, nem alvo em `package.json`. O artefato distribuído era um ZIP do working tree, e por isso carregava dependências reinstaláveis, caches, dados locais do console e estado de desenvolvimento — inclusive, como a inspeção confirmou, duas worktrees de agente de 3,4 MB em `.claude/worktrees/`, que nem estavam no `.gitignore`.

Um artefato derivado do working tree tem duas propriedades ruins que se reforçam: ele varia conforme a máquina de quem empacota, e ele contém coisas que ninguém decidiu publicar. A segunda é a mais séria — é assim que estado local sai da máquina de alguém.

## Options considered

1. **`git archive` de um commit, com allowlist explícita de caminhos** (escolhida).
   - Pros: o artefato é função de um commit, não de um diretório — dois empacotamentos do mesmo commit produzem o mesmo conteúdo; arquivo não rastreado é invisível por construção, então caches, `node_modules`, `.env` e worktrees não podem entrar nem por descuido; a allowlist é legível numa tela e revisável em PR — a pergunta "por que este caminho está na release?" tem resposta versionada.
   - Cons: um caminho novo precisa ser adicionado à mão, e esquecer disso produz um pacote incompleto. Foi exatamente o que aconteceu na primeira execução: quatro checks liam `.engineos/{README,archived/README,changes/README,changes/_template}.md` e o pacote saiu com 108→102 checks. O custo é real, mas o modo de falha é ruidoso e detectado pelo smoke test — ao contrário do modo de falha oposto.

2. **`export-ignore` no `.gitattributes` (denylist)** (rejeitada).
   - Pros: nenhum arquivo novo precisa ser declarado; `git archive` já respeita o atributo.
   - Cons: inverte o ônus da prova. Um diretório novo entra na release por padrão, e alguém só descobre depois. A pergunta que importa numa auditoria de distribuição não é "o que eu quis excluir?", é "por que isto está aqui?" — e a denylist não responde. Mantém-se `export-ignore` como recurso adicional, nunca como mecanismo principal.

3. **ZIP do working tree com exclusões por padrão de nome** (rejeitada — é o estado anterior).
   - Pros: nenhum trabalho.
   - Cons: o conteúdo depende da máquina; a lista de exclusões nunca acompanha o que aparece no diretório; foi o que produziu o artefato com dependências e worktrees dentro.

## Decision

Opção 1. `scripts/package-release.sh` empacota a partir de um commit (`HEAD` por padrão, `--commit` para outro) via `git archive`, usando uma allowlist explícita, e recusa empacotar se `package.json` e `.claude-plugin/plugin.json` declararem versões diferentes.

Duas consequências decorrem disso e são parte da decisão, não detalhe de implementação:

- **O teste roda sobre os bytes finais.** Extrair o ZIP, rodar `validate-engineos.sh`, `npm ci`, typecheck e testes ali dentro. Testar o working tree e publicar o ZIP são duas coisas diferentes; só a primeira dá evidência sobre a segunda se elas forem o mesmo conteúdo, e isso precisa ser demonstrado, não presumido.
- **O empacotador verifica o que ele mesmo produziu**: ausência de CRLF nos formatos POSIX, bit de execução coerente, ausência de dependências e estado local, varredura de segredos, lockfiles e entrypoints. Emite `MANIFEST.txt` com sha256 por arquivo e `.sha256` do pacote.

## Consequences

- Todo caminho novo que a release precisa entra na allowlist de `scripts/package-release.sh`, com o smoke test do artefato como rede.
- O bit de execução autoritativo é o do índice do git, não o do filesystem: em Windows com `core.fileMode=false`, um `chmod +x` local não chega ao pacote. A verificação do empacotador reprovou exatamente esse caso no próprio commit que a introduziu (`d20b43f`), o que é a evidência de que ela funciona.
- A varredura de segredos sobre o artefato não encontrar achado **não** é prova de ausência de segredo, e não deve ser citada como tal em relatório de prontidão.
- Os espelhos de adaptador (`.agents/`, `.trae/`, `.windsurf/`, `.cursor/`) ficam fora por padrão e entram com `--with-ide-mirrors`, porque são superfície de outra ferramenta e não do runtime.
