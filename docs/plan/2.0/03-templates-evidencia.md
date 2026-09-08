# EngineOS 2.0 — Templates de evidência e aceite

Formatos obrigatórios para fechar tarefa, cruzar gate e liberar release. Compatíveis com
`rules/gates.md`, `rules/verification.md`, `skills/record-change/` e `templates/handoff.md`.

## Princípio

Uma tarefa está concluída quando existe evidência que **um terceiro consegue reexecutar**.
Três coisas nunca contam como evidência:

- typecheck ou build passando isoladamente;
- descrição em prosa do que o agente afirma ter feito;
- ausência de erro onde nenhum teste rodou.

Ausência de dado nunca vira sucesso. Teste pulado, custo desconhecido e erro de
infraestrutura permanecem explicitamente marcados como **não medido**.

---

## Template 1 — Task card

Um por tarefa `E0X-Tn`. Vive em `.engineos/changes/<data>-<slug>.md` até ser arquivado.

```markdown
---
id: E04-T7
epico: E04
titulo: Aprovação persistida e invalidável
responsavel: <nome>
dependencias: [E01-T11]
risco: high
autonomia: A0
gate: validation
status: pending | in_progress | blocked | done
spec: docs/specs/<data>-<slug>-design.md   # obrigatório se >2 arquivos ou capacidade nova
---

## Objetivo observável
<Uma frase. O que passa a ser verdade no sistema quando isto terminar.>

## Escopo
Arquivos: <lista fechada>
Fora de escopo: <o que explicitamente não muda>

## Configuração de teste
Ambiente: <local | homologação | staging>
Dados: <origem e autorização>
Comandos:
```
<comandos exatos, reexecutáveis>
```

## Critérios de aceite
- [ ] <pós-condição verificável 1>
- [ ] <pós-condição verificável 2>
- [ ] Cenário de falha: <o controle removido faz o teste falhar>

## Evidência
| Item | Valor |
|---|---|
| Commit | <sha> |
| config_version | <valor> |
| Comando | <comando> |
| Resultado | <saída resumida + link do log> |
| Data | <ISO 8601> |
| Não medido | <lista explícita, ou "nenhum"> |

## Rollback
<Passos para desfazer. Se o rollback for inseguro por incompatibilidade de dados,
dizer isso aqui e descrever a recuperação progressiva.>

## Limitações conhecidas
<O que esta entrega não cobre e não deve ser anunciado como coberto.>
```

**Regra de recusa:** um task card sem seção de cenário de falha não fecha tarefa de risco
`medium` ou `high`. Comprovar que algo funciona não comprova que o controle bloqueia.

---

## Template 2 — Evidência de gate

Um por passagem de gate da escada `discovery → design → implementation → validation → release`.

```markdown
# Gate <nome> — <épico ou fase>

Data: <ISO 8601> · Commit: <sha> · Perfil: <local | hospedado | distribuído>

## Tarefas cobertas
| ID | Aceite atendido | Evidência | Não medido |
|---|---|---|---|
| E0X-Tn | sim/não | <link> | <lista> |

## Verificação executada
| Check | Comando | Resultado | Log |
|---|---|---|---|
| typecheck | `npm run typecheck` | verde/vermelho | <link> |
| testes | `npm test` | verde/vermelho | <link> |
| integridade | `scripts/validate-engineos.sh` | N checks | <link> |
| evals determinísticos | `scripts/run-evals.sh --deterministic` | N/N | <link> |
| evals live | `scripts/run-evals.sh --live` | N/N ou **pulado** | <link> |

## Cenários de falha comprovados
| Controle | Como foi removido | Teste que passou a falhar |
|---|---|---|

## Critic (obrigatório em risco high)
Agente: `critic` · Veredito: <refutou | não refutou> · Achados: <lista ou "nenhum">

## Decisão
Passa / Não passa · Responsável: <nome> · Riscos residuais aceitos: <lista>
```

**Regra de recusa:** eval live pulado não pode ser reportado como aprovado. O campo é
`pulado`, e o gate registra que não há evidência de precisão live nessa corrida.

---

## Template 3 — Checklist por gate operacional

Um por perfil de implantação declarado em `E01-T3`. Campo pendente bloqueia a liberação
daquele perfil — não do produto inteiro, e não silenciosamente.

```markdown
# Prontidão operacional — perfil <nome>

| Gate | Entrega obrigatória | Responsável | Status | Evidência | Valor acordado |
|---|---|---|---|---|---|
| Capacidade e SLO | Metas de sucesso, latência, concorrência e custo por classe de tarefa | Tech Lead + Operações | ⬜ | | SLO: <pendente> |
| Segurança e isolamento | Modelo de ameaças, menor privilégio, segredos fora do modelo, autorização por recurso | Security + Backend | ⬜ | | |
| Estado e recuperação | Inventário de dados duráveis, backup, RPO/RTO, restauração ensaiada | DevOps + Data | ⬜ | | RPO: <pendente> · RTO: <pendente> |
| Migrações e atualização | Compatibilidade de schema/config/adapters, migração repetível, retorno | Backend + DevOps | ⬜ | | |
| Supply chain | Lockfiles, SBOM, integridade do pacote, análise de dependências | DevOps + Security | ⬜ | | |
| Observação e resposta | Dashboards, alertas com proprietário, runbooks, severidade | Operações | ⬜ | | |
| Liberação gradual | Ambientes separados, flags, canário, critérios de interrupção | Release owner | ⬜ | | |
| Dados e auditoria | Retenção, exclusão, acesso a logs, histórico protegido | Backend + Security | ⬜ | | Retenção: <pendente> |
| Suporte | Matriz de versões/plataformas, instalação, upgrade, diagnóstico, incidente | Tech Lead + Operações | ⬜ | | |

Legenda: ⬜ pendente · 🟡 parcial com limitação declarada · ✅ atendido com evidência
```

Os campos numéricos — SLO, RPO, RTO, retenção, orçamento — **ainda não foram informados**.
São decisão do responsável pelo produto e do Tech Lead em `E01-T3`, e cada um deles é um
bloqueio nominal até ser preenchido. Um perfil com campo `<pendente>` não é liberado.

---

## Template 4 — Relatório de prontidão de release

Um por release. É o artefato que autoriza a liberação; sua ausência é a resposta.

```markdown
# Relatório de prontidão — EngineOS <versão>

Data: <ISO 8601> · Responsável pela liberação: <nome>

## 1. Identidade do que é liberado
| Item | Valor |
|---|---|
| Commit | <sha> |
| Hash do artefato | <sha256> |
| Versão do pacote | <x.y.z> |
| Versão dos manifests | <x.y.z> |
| Versão de policy.json | <x.y.z> |
| Versões de dataset de eval | <lista> |
| config_version de referência | <valor> |

## 2. Perfis liberados
| Perfil | Liberado | Gates atendidos | Limitação declarada |
|---|---|---|---|
| Local single-user | sim/não | 9/9 | |
| Local time | sim/não | | |
| Hospedado | **não** | | Sem authn/RBAC/isolamento (E03-T17) |
| Distribuído | sim/não | | |

## 3. Validação integrada
| # | Passo | Resultado | Evidência |
|---|---|---|---|
| 1 | Cadastrar skill, modelo e tool | | |
| 2 | Publicar configuração | | |
| ... | | | |
| 11 | Restaurar backup e conferir compatibilidade | | |

## 4. Capacidades anunciadas
Cada linha aponta para implementação e evidência. Capacidade sem as duas não entra.
| Capacidade | Implementação | Evidência | Perfis |
|---|---|---|---|

## 5. O que não está pronto
<Lista explícita. Funcionalidade desenhada e não implementada aparece aqui,
nunca na seção 4.>

## 6. Riscos residuais aceitos
| Risco | Impacto | Por que foi aceito | Quem aceitou | Gatilho de reversão |
|---|---|---|---|---|

## 7. Rollback
Procedimento: <passos>
Compatibilidade de dados confirmada: sim/não
Se não: recuperação progressiva descrita em <link>

## 8. Assinaturas
Produto: <nome/data> · Tech Lead: <nome/data> · Security: <nome/data> · Operações: <nome/data>
```

---

## Template 5 — Handoff entre ondas

Barreira de onda e fim de sessão. Estende `templates/handoff.md`.

```markdown
## Objetivo
<o que esta onda deveria tornar verdadeiro>

## Estado
Gate atual: <nome> · Risco: <tier> · Onda: <F<n>.<m>>
config_version em uso: <valor>

## Feito
<com evidência, não com adjetivos>

## Decisões tomadas
<e por quê — para que a próxima sessão não as reabra sem motivo>

## Arquivos tocados
<lista>

## Evidência
<comandos e resultados>

## Falhas conhecidas
<o que está vermelho agora>

## Riscos em aberto
<o que pode quebrar e ainda não foi testado>

## Não feito
<explicitamente>

## Próximo passo
<uma ação concreta — nunca "continuar de onde parou">
```

---

## Template 6 — Registro de "não medido"

Anexo de qualquer relatório que contenha lacuna. Existe para impedir que a lacuna
desapareça na próxima leitura.

```markdown
| Item | Por que não foi medido | O que seria necessário | Bloqueia qual gate |
|---|---|---|---|
| Precisão live do roteador | 33 casos ignorados na corrida <id> | Credenciais e teto de custo | E06 / gate validation |
| Custo por tarefa | Provider não reporta no plano atual | Reconciliação por fatura | E05-T3 / gate release |
```

---

## Como estes templates se ligam ao que já existe

| Template | Ancora em | Verificado por |
|---|---|---|
| Task card | não-negociável #5 do `CLAUDE.md` (change record) | hook `record-verify.sh` (Stop gate) |
| Evidência de gate | `rules/gates.md`, `rules/verification.md` | hooks `stop-verify.sh` + revisão do `critic` |
| Checklist operacional | §8 do plano 2.0 | revisão do Tech Lead por perfil |
| Relatório de prontidão | §8 e validação integrada | assinatura nominal, não automação |
| Handoff | `templates/handoff.md` | barreira de onda |
| Não medido | `rules/verification.md` | leitura obrigatória no gate de release |

O hook `record-verify.sh` depende de `jq`. Sem `jq` ele sai em silêncio e o Stop gate de
change record simplesmente não dispara — o que significa que a ausência de bloqueio não
prova conformidade. Verificar `jq` faz parte da configuração de teste de qualquer tarefa
que dependa desse gate.
