# Compatibility and Deprecation Policy

EngineOS ships as a plugin that other repositories consume. Their `CLAUDE.md`
files reference rule paths, agent names, aliases and slash commands from this
repo. Renaming any of those silently breaks every consumer.

This file is the contract. Version lives in `.claude-plugin/plugin.json`.

## What is public surface

Changing any of these is a **breaking change**:

| Surface | Why consumers depend on it |
|---|---|
| `rules/*.md` paths | Referenced by path in project `CLAUDE.md` and in router rows |
| Agent `name:` values | Used in Task dispatch and `/engineos:*` commands |
| Agent aliases | Typed directly as slash commands |
| Slash command names under `commands/` | Typed directly |
| Skill directory names | Invoked by name via the Skill tool |
| Hook event contract in `hooks/hooks.json` | Consumers wire these into their settings |
| `registries/*.json` top-level shape | Read by hooks and by tooling |
| `scripts/kernel.sh` subcommand names and their JSON answer shape | Called by hooks, by the router agent, and by consumers' own tooling |
| The `## Return format` envelope fields | Parsed by orchestrators |

The kernel subcommands covered by that row are `route-path`, `route-intent`,
`model`, `risk`, `gates`, `repair`, `admit`, `breaker`, `hitl`, `waves`,
`decision-rules`, `scale`, `route-escalate`, `resolve-task` and `skill-state`. Adding a subcommand or a field to an answer
is MINOR; removing or renaming either is MAJOR and gets the deprecation window
below. Two arms that had no caller anywhere — `retry` and `capability` — were
removed *before* this row was written, deliberately: they were the last
removals this policy did not yet cover. The kernel's internals are not surface:
`reg`, the jq programs, and how many processes an answer costs are free to change
as long as the answer does not.

Not public surface — change freely: rule *prose* (as long as the file keeps its
path and meaning), agent method sections, hook internals, test files, `docs/`.

## Semantic versioning

- **MAJOR** — a public surface above is removed or renamed; a rule's meaning
  reverses; a hook changes from advisory to blocking.
- **MINOR** — a rule, agent, skill, command, registry entry or router row is
  added; an existing rule is tightened in a way that flags more, not less.
- **PATCH** — wording, typos, test coverage, internal refactors, bug fixes in
  hooks that restore intended behaviour.

Tightening a rule is MINOR, not PATCH: a consumer's CI can start failing on it.
Say so in the release notes.

## Deprecation window

Nothing in the public surface is removed in the release that deprecates it.

1. **Deprecate** (release N, MINOR) — the replacement ships alongside. The old
   path or name keeps working. `docs/release-notes/` names the replacement and
   the removal version.
2. **Warn** (releases N+1 onward) — using the deprecated surface emits a warning.
   For a renamed rule, leave a stub file whose content points at the replacement.
   For a renamed agent or alias, leave the old command in place forwarding to the
   new one.
3. **Remove** (the next MAJOR, and not before) — earliest removal is one minor
   release after deprecation.

A rename is a deprecation, not an edit. `git mv rules/foo.md rules/bar.md` in one
commit is a breaking change dressed as housekeeping.

## Ownership

Every rule file, agent and skill has an owner responsible for reviewing changes
to it and for deciding its deprecations. Where there is no explicit owner, the
repo maintainers own it collectively — which in practice means any change needs a
review from someone who did not write it.

Changes to the always-on set (`rules/base.md`, `security.md`, `git.md`,
`context.md`) load into every session in every
consuming project. They get the highest review bar and are never batched with
unrelated work.

## Consumer guidance

- Pin the plugin version. Do not track a moving branch.
- Read `docs/release-notes/` before upgrading a MINOR — tightened rules can fail
  a build that passed yesterday.
- Project `CLAUDE.md` holds **deltas only** (`rules/memory.md`). A project that
  copies EngineOS rules instead of referencing them has opted out of this policy
  and will not get the fixes.

## Checklist for a breaking change

- [ ] The replacement exists and is documented.
- [ ] The deprecated surface still works, with a warning.
- [ ] `docs/release-notes/` names the removal version.
- [ ] `scripts/validate-engineos.sh` passes with both old and new surfaces present.
- [ ] MAJOR version bumped in `.claude-plugin/plugin.json`.
- [ ] Consumers who need to act are told what to change, not just what broke.

## What `enabled: false` does and does not do

`enabled: false` na frontmatter de `skills/<id>/SKILL.md` é o interruptor que o
console mostra. Até 07/09/2026 **nada fora do console lia esse campo**: desabilitar
uma skill mudava um arquivo e nada mais, e a interface apresentava como controle
algo que não controlava nada. Esta seção é o contrato do que ele passou a valer —
e do que ele continua não valendo, que é a parte que não pode ser omitida.

**O que passa a ser verdade.** O kernel deixa de recomendar a skill, nos três
lugares onde ele responde sobre skills:

| Answer | Comportamento com a skill desabilitada |
|---|---|
| `kernel.sh route-path <file>` | Sai de `skills`; entra em `skills_suppressed` com `reason: "disabled"` |
| `kernel.sh route-intent <text>` | Idem, por intent correspondida |
| `kernel.sh resolve-task --prompt` | Idem, em `task_contract` |
| `kernel.sh skill-state [--id <s>]` | Responde a resolução diretamente, para console, check e hook lerem a mesma coisa |

A supressão é **visível**, nunca silenciosa. Uma lista curta e uma lista filtrada
são indistinguíveis para o operador se o motivo não vier junto, e um controle cujo
efeito não pode ser observado volta a ser decorativo por outro caminho.

**O que continua não sendo verdade, e não pode ser anunciado.** EngineOS **não**
impede alguém de invocar uma skill desabilitada pelo nome: a ferramenta Skill lê o
diretório e não há hook entre as duas coisas. O que existe é recomendação e
roteamento; remoção efetiva exige tirar o diretório da instalação. Isto é o que a
matriz de adaptadores chama de degradar para convenção, dito no lugar certo:
**quem quiser bloqueio real precisa desinstalar a skill, não desabilitá-la.**

**Ausência do campo significa habilitada.** É o contrato do console
(`console/src/lib/entities/skills.ts`) e a única leitura que mantém funcionando
toda skill escrita antes de o campo existir. Só a **primeira** frontmatter é lida,
e só quando o arquivo começa com ela: uma linha `enabled:` no corpo é documentação,
não configuração, e nunca desliga uma skill.

**Onde isso é testado.** `scripts/test-kernel.sh` planta uma skill desabilitada
numa árvore de fixture e afirma que o roteamento a derruba, que diz por quê, que a
ausência do campo significa habilitada e que uma menção no corpo não desliga nada.
Os checks `C34` (todo answer que emite `skills` emite `skills_suppressed`) e `C35`
(nenhum domínio de routing fica sem skill habilitada) guardam a fronteira.

Adicionar `skills_suppressed` às respostas e `skill-state` à lista de subcomandos
é **MINOR** — campo e subcomando novos, nada removido nem renomeado.

## Supported platforms and prerequisites

Distribuição local também é uso de produção: exige suporte declarado, atualização
segura e recuperação. Esta é a matriz que a release cobre. Uma plataforma que não
está aqui não está suportada — não é "provavelmente funciona".

| Plataforma | Estado | Como é verificada |
|---|---|---|
| Linux (x86-64) | **Suportada** | Job `verify` + job `package` em `ubuntu-latest`: gera o artefato, extrai e roda `validate-engineos.sh`, `npm ci`, typecheck e testes sobre os bytes finais |
| Windows + Git Bash | **Suportada** | Job `package` em `windows-latest`, mesma sequência, mais a guarda de que o checkout não diverge do HEAD |
| macOS | **Não suportada** | Nunca executada em CI nem manualmente. Não declarar suporte antes de a matriz cobri-la |
| PowerShell (`install.ps1`) | **Parcial** | Sintaxe e presença verificadas no artefato; a execução do instalador não roda em CI |

### Pré-requisitos

| Requisito | Versão | Onde é declarado | O que acontece sem ele |
|---|---|---|---|
| Node.js | `>= 18` | `package.json.engines`, `src/node-guard.ts` (`MIN_NODE_MAJOR`) | O guard recusa ou pula o hook com mensagem explícita — não falha em silêncio |
| `bash` | POSIX bash | `.gitattributes` força LF em `*.sh` para que continuações de linha não quebrem | Hooks e kernel não executam |
| `jq` | qualquer | `install.sh` (§5) | **Hooks não são registrados.** O instalador avisa e continua; todo hook que analisa entrada com `jq` fica silencioso. Uma instalação sem `jq` tem regras, não gates |

### Fim de linha e modo de execução

`.gitattributes` declara LF para todo texto, com `*.ps1` em CRLF como única exceção
(host Windows, fora de qualquer parser POSIX). Isso não é preferência de estilo: sem
essa política, um checkout em Windows reescreve ~509 arquivos e o diff do repositório
deixa de ser legível — foi o estado medido em 07/09/2026, com 512 arquivos alterados
e nenhuma mudança semântica.

Três pontos de aplicação sustentam a promessa, e mudar um sem os outros é regressão:

| Promessa | Onde é aplicada | Onde é testada |
|---|---|---|
| Todo texto em LF | `.gitattributes` | Check `C33`; job `package` falha se o checkout divergir do HEAD |
| Script executável tem o bit; biblioteca `source` não | modos no índice do git | Check de modos de hook; verificação do `scripts/package-release.sh` sobre os bytes finais |
| Espelhos de adaptador não divergem | `.agents/`, `.trae/`, `.windsurf/` | Check `C32` |

O bit de execução **não** sobrevive a um checkout Windows com `core.fileMode=false`:
o valor autoritativo é o do índice do git, não o do filesystem. Um `chmod +x` local
que não vira `git update-index --chmod=+x` não chega ao pacote — e o empacotador
recusa a release quando isso acontece.

### Adaptadores de outras ferramentas

A matriz de enforcement por ferramenta — o que é bloqueante, o que roda em CI e o que
degrada para convenção — vive em [`templates/adapters/README.md`](../templates/adapters/README.md)
e é a fonte para esse recorte. Regra que nada verifica é convenção; chamá-la de gate
numa ferramenta que não pode aplicá-la é como uma equipe deixa de confiar no sistema
inteiro.

Os espelhos `.agents/`, `.trae/` e `.windsurf/` ficam **fora** do pacote por padrão;
entram com `scripts/package-release.sh --with-ide-mirrors`.

## 1.6.0 additions

`1.6.0` is a MINOR release. Everything below is added or tightened: **nothing in
the public surface is removed, nothing is renamed, and no deprecation window is
opened**, so the breaking-change checklist above does not apply to it. The
per-release account lives in `docs/release-notes/1.6.0.md`.

| Surface | 1.6.0 change | Kind |
|---|---|---|
| `scripts/kernel.sh` subcommands | `admit`, `breaker`, `hitl` | added |
| `registries/policy.json` | new keys `parallelism.backpressure`, `breaker`, `hitl`, `telemetry.exec_journal` | added |
| `registries/policy.json` | `telemetry.events[].written_by` string -> array | shape change, see below |
| `registries/policy.json` | new telemetry event `hitl` | added |
| `scripts/exec-journal.sh` | twelve optional v2 span fields on `append`, validated by `validate` | added |
| `scripts/exec-journal.sh` | `validate` rejects a non-slug `run_id`, `capability_id` or `agent` | tightened |
| `commands/init.md` | new slash command `/engineos:init` | added |
| `scripts/init-project.sh` | project-scoped adoption bootstrap | added |
| `hooks/scaffold-layout.sh` | shared scaffold function, sourced by `hooks/ensure-project-layout.sh` and `scripts/init-project.sh`. It is NOT registered in `hooks/hooks.json`, so the hook event contract is unchanged | added |
| `rules/parallelism.md` | `## Backpressure`, `## Circuit breaker` | added |
| `rules/risk-autonomy.md` | `## Human-in-the-loop` | added |
| `rules/observability.md` | `## Agent traces` | added |
| `rules/llm-apps.md` | `## RAG` rewritten to name required metrics and artifacts | tightened |
| `.engineos/changes/_template.md` | `## Human decisions` section, declared in `registries/intents.json` `record-change.required_sections` | added |

The three kernel subcommands, the `/engineos:init` command,
`scripts/init-project.sh` and `hooks/scaffold-layout.sh` are versioned surface
from the day they land. Renaming any of them later is a deprecation with a
window, not an edit.

### The one shape change consumers can break on

`telemetry.events[].written_by` was a string and is now an array of strings, on
all four events (`route`, `decision-rules`, `verify`, `hitl`).

This is not a breaking change under the surface table above, which names the
`registries/*.json` **top-level shape** — `written_by` is nested two levels
inside `telemetry`. It is still the only value in 1.6.0 whose type changed, so a
reader outside this repo that assumed a string gets an array and no warning.
What to change:

```bash
# 1.5.0 printed one path; 1.6.0 prints a JSON array
jq -r '.telemetry.events[] | select(.id == "route") | .written_by' registries/policy.json

# 1.6.0 equivalent of the old output
jq -r '.telemetry.events[] | select(.id == "route") | .written_by[]' registries/policy.json
```

A comparison of the form `.written_by == "hooks/prompt-advisor.sh"` becomes
`.written_by | index("hooks/prompt-advisor.sh")`. In-repo the only readers are
the C22 integrity checks, which were updated in the same release.

`telemetry.exec_journal.written_by` is a new key and is an array from the
outset — there is no migration for it.

### Why the `exec-journal.sh validate` tightening is MINOR, not PATCH

In 1.5.0, `scripts/exec-journal.sh validate` accepted any string in `run_id`,
`capability_id`, `agent` and `timestamp`, and checked `status` and `model_tier`
for type only. In 1.6.0 the four slug fields must match the slug class
`^[A-Za-z0-9@_./:-]+$` and the two enumerated fields must be members of their
declared vocabularies, so a line that validated yesterday can fail today. Per
**Semantic versioning** above, a rule tightened to flag more is MINOR and must
be named in the release notes; it is named there.

One narrow break deserves its own sentence, because it is the only case where a
*well-formed* value is now rejected: `+` is not in the slug class, so a
`timestamp` carrying a numeric UTC offset — `2026-09-03T12:00:00+00:00` — fails
validation where `2026-09-03T12:00:00Z` passes. Nothing in this repo writes the
offset form (`exec-journal.sh` defaults to `date -u +%Y-%m-%dT%H:%M:%SZ`), so
no EngineOS-written journal is affected; a third-party writer using offsets is.
Widening the class for `+` is a compatibility event of its own and was not
taken here.

`note` is deliberately still free text and is the only field that admits it —
which is not the same as being the only field a consumer must distrust. Every
other field is shape-bounded, not classified: harness-supplied characters still
reach disk dash-joined, and the class admits `.` and `/`, so a journal field is
never safe as a filesystem path component without `hooks/lib-common.sh`'s
`hook_path_slug`.
Adding a second free-text field to the journal is a compatibility event, not a
convenience. The guard bounds the shape and the size of what reaches disk; it
does not classify content, and `hooks/lib-common.sh` sanitizes rather than
rejects at the hook boundary, so a harness-supplied value's characters still
transit dash-joined.
