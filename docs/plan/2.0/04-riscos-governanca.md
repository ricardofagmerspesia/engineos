# EngineOS 2.0 — Riscos e governança

## 1. Registro de riscos

Escala de probabilidade e impacto: baixa / média / alta. **Exposição** = a combinação, com
o pior dos dois pesando mais. Cada risco tem um **gatilho observável** — a condição que
indica que ele deixou de ser hipótese — e um **dono nominal**.

### 1.1 Riscos de produto e escopo

| # | Risco | Prob. | Impacto | Exposição | Mitigação | Gatilho observável | Dono |
|---|---|---|---|---|---|---|---|
| R01 | Anunciar como pronta uma capacidade apenas desenhada | **alta** | alta | **crítica** | `E01-T4` exige implementação + evidência por linha; §4 do relatório de prontidão rejeita linha sem as duas | Uma capacidade aparece em release notes sem link para teste | Produto |
| R02 | "2.0" ser publicado antes dos critérios de release | média | alta | alta | Versão só sobe em `E01-T6`, depois de F0; marcos A/B/C são bloqueios, não etiquetas | Manifest com 2.0.0 em commit anterior ao marco A | Tech Lead |
| R03 | Escopo crescer para acompanhar o documento (RAG, filas, hospedagem) sem decisão de perfil | **alta** | média | alta | `E01-T3` fixa perfis; capacidade fora do perfil liberado fica declarada não suportada | Tarefa de F3/F4 entra em execução antes de F1 terminar | Produto |
| R04 | Confundir consolidação com expansão e tratar E08/E09 como pré-requisito universal | média | média | média | Tabela de natureza em `01-decomposicao-epicos.md`; F4 é pulável por decisão explícita | Discussão de fila antes de o runner local estar governado | Tech Lead |
| R05 | Notas qualitativas da análise anterior virarem meta de aceite | média | média | média | Documento declara que não são baseline; metas vêm de `E05-T8` e `E06-T8` | Alguém cita uma nota numérica como critério | Produto |

### 1.2 Riscos técnicos

| # | Risco | Prob. | Impacto | Exposição | Mitigação | Gatilho observável | Dono |
|---|---|---|---|---|---|---|---|
| R06 | Decisão do kernel não chegar à transição real de execução — enforcement anunciado e ausente | **alta** | **alta** | **crítica** | `E04-T3/T4/T7` ligam admit/breaker/hitl a transições; `E01-T13` mapeia regra → ponto de aplicação → teste; regra sem ponto de aplicação é marcada como não aplicada | `docs/TRACEABILITY.md` com linha sem ponto de aplicação | Backend |
| R07 | `enabled=false` no console sem efeito no runtime | **alta** | alta | **crítica** | `E03-T15` é teste ponta a ponta e condição de saída de F2 | Console mostra desabilitado e o trace mostra a chamada | Backend |
| R08 | Publicação parcial corromper configuração (arquivos gravados, commit não feito) | média | **alta** | alta | `E03-T12` com comparação de revisão, serialização e recuperação; falha injetada em cada etapa | Divergência entre `published_snapshot` e o working tree | Backend |
| R09 | Rollback descartar alteração do operador | média | alta | alta | `E03-T14` detecta alteração intermediária e apresenta conflito em vez de sobrescrever | Reclamação de trabalho perdido após rollback | Frontend |
| R10 | Efeito externo duplicado em retomada de worker | média | **alta** | alta | `E09-T5` idempotência por efeito + consulta de resultado externo; `E09-T10` teste de caos | Dois registros do mesmo efeito com run_id igual | Backend |
| R11 | Fallback de modelo escolhido por nome de tier, não por capacidade | média | média | média | `E04-T10` valida disponibilidade e capacidade; motivo do fallback registrado | Fallback para modelo sem a capability exigida | LLM |
| R12 | Custo desconhecido registrado como zero | média | média | média | `E05-T3` campo de disponibilidade separado do valor | Dashboard com custo 0 em execução real | Backend |
| R13 | CRLF ou perda de bit de execução voltar em uma release futura | média | média | média | `E02-T10` regressão automatizada sobre o pacote final | Instalação exigindo `chmod` manual | DevOps |
| R14 | Artefato levar estado local (`console/.data`, caches, worktree) | **alta** | média | alta | `E02-T1` allowlist; `E02-T2` remove rastreamento do SQLite; manifesto comparado em CI | `unzip -l` com entrada fora da allowlist | DevOps |
| R15 | Hooks silenciosos por ausência de `jq` mascararem falta de governança | média | média | média | Documentado em `03-templates-evidencia.md`; verificação de `jq` na configuração de teste | Ausência de linha `[router]` em edições | DevOps |
| R16 | Carga de regra não fechada fazer sumir uma política deferida | média | alta | alta | `E03-T5` valida fechamento; `scripts/validate-engineos.sh` já checa as duas metades | Check de fechamento falhando em CI | Tech Lead |

### 1.3 Riscos de segurança e dados

| # | Risco | Prob. | Impacto | Exposição | Mitigação | Gatilho observável | Dono |
|---|---|---|---|---|---|---|---|
| R17 | Autorização decidida no prompt em vez do servidor | média | **alta** | **crítica** | `E10-T3` decide no servidor; `E10-T11` testes adversariais na fronteira real | Agente de leitura conseguindo escrever por outra tool | Security |
| R18 | Aprovação reutilizada em escopo diferente do aprovado | média | **alta** | alta | `E04-T7` vincula a ação, hash de argumentos, destino e `config_version`; `E10-T6` valida escopo | Aprovação aceita após mudança de destino | Security |
| R19 | Revogação não afetar execução retomada | média | **alta** | alta | `E10-T4` reverifica na execução, inclusive após pause/resume | Run retomado usando credencial revogada | Security |
| R20 | Prompt injection via resultado de tool ou documento de RAG | **alta** | **alta** | **crítica** | `E10-T8` e `E08-T3` tratam resultado e documento como entrada não confiável; casos adversariais no eval set | Comportamento mudando após conteúdo hostil plantado | Security |
| R21 | Vazamento entre projetos na memória ou no RAG | média | **alta** | **crítica** | `E07-T6` e `E08-T10` com teste negativo construído para favorecer o vazamento | Recuperação retornando item de outro projeto | LLM |
| R22 | Prompt, segredo ou dado pessoal em log | média | alta | alta | `E05-T6` redação por padrão; teste com segredo plantado | Segredo plantado aparecendo na saída | Security |
| R23 | Segredo no artefato distribuído | baixa | **alta** | alta | `E02-T6` varredura sobre os bytes finais, bloqueante | Achado confirmado na varredura | DevOps |
| R24 | Console hospedado exposto sem authn/RBAC | baixa | **alta** | alta | `E03-T17` mantém o perfil desabilitado e declarado não suportado até passar | Console acessível fora de `127.0.0.1` sem autenticação | Security |

### 1.4 Riscos de processo

| # | Risco | Prob. | Impacto | Exposição | Mitigação | Gatilho observável | Dono |
|---|---|---|---|---|---|---|---|
| R25 | Papéis de execução permanecerem propostos, sem pessoas | **alta** | alta | **crítica** | Nenhuma onda inicia sem responsável nominal; o registro de riscos tem dono nominal, não papel | Task card com responsável `<nome>` não preenchido | Produto |
| R26 | Valores de SLO/RPO/RTO/retenção nunca serem fixados | **alta** | alta | alta | `E01-T3` os torna bloqueio nominal; checklist do perfil rejeita `<pendente>` | Checklist operacional com campo pendente na véspera da liberação | Tech Lead |
| R27 | Metas revisadas para baixo depois da adoção, sem registro | média | média | média | §8 exige preservar evidência anterior ao alterar meta | SLO alterado sem baseline anexada | Operações |
| R28 | Gate cruzado por conclusão de tarefas em vez de evidência | **alta** | alta | **crítica** | Templates 2 e 4 exigem evidência reexecutável; `critic` obrigatório em risco high | Gate marcado como passado sem seção de cenário de falha | Tech Lead |
| R29 | Bypass ligado de forma permanente em ambiente compartilhado | média | alta | alta | `E05-T9` registra bypass por caminho independente; flag machine-wide não expira sozinha | Registro de bypass contínuo por mais de uma sessão | Operações |
| R30 | Depreciação silenciosa de superfície pública quebrar consumidores | média | alta | alta | `E01-T7` + `docs/COMPATIBILITY.md`: nada é removido na release que deprecia | Rename sem stub nem forwarding | Tech Lead |

### 1.5 Riscos críticos — os oito que decidem a release

R01, R06, R07, R17, R20, R21, R25, R28. Todos compartilham a mesma forma: **o sistema
parece controlado e não está**. São os únicos cuja mitigação não pode ser adiada por
classificação de prioridade, e cada um tem um teste que falha quando o controle é removido.

Um controle sem teste que o comprove pela negativa não conta como mitigação.

---

## 2. Modelo de governança

### 2.1 Papéis

Papéis são funções, não pessoas. Cada um precisa de **uma pessoa nominal** antes do início
da onda correspondente — R25 existe porque hoje nenhum tem.

| Papel | Decide | Não decide |
|---|---|---|
| Responsável pelo produto (Ricardo Fagmer) | Perfis de implantação, escopo da release, aceite de risco residual, liberação | Implementação, escolha de stack |
| Tech Lead | Arquitetura, ADRs, passagem de gate técnico, matriz de compatibilidade | Aceite de risco de negócio |
| Security | Fronteira de autorização, tratamento de segredo, veto em risco de segurança | Prioridade de roadmap |
| DevOps | Distribuição, CI, supply chain, backup e restauração | Contrato de API |
| QA/LLM | Datasets, scorers, calibração de judge, marcação de não medido | Passagem de gate sozinho |
| Operações | SLOs operacionais, alertas, runbooks, interrupção de adoção | Escopo |
| Release owner | Liberação gradual, canário, critério de interrupção | Aceite de gate técnico |

**Veto de segurança:** Security pode bloquear qualquer passagem de gate por risco de
segurança, e o bloqueio só é removido por correção ou por aceite formal e registrado do
responsável pelo produto, com o risco residual escrito no relatório de prontidão.

### 2.2 RACI por épico

R = executa · A = responde pelo resultado · C = consultado · I = informado

| Épico | Produto | Tech Lead | Backend | Frontend | Security | DevOps | QA/LLM | Operações |
|---|---|---|---|---|---|---|---|---|
| E01 | A | R | C | I | C | C | C | I |
| E02 | I | A | I | I | C | R | C | I |
| E03 | C | A | R | R | C | I | C | I |
| E04 | I | A | R | I | C | I | C | I |
| E05 | I | C | R | I | C | R | C | A |
| E06 | I | C | C | I | C | I | R/A | I |
| E07 | I | A | R | I | C | I | R | I |
| E08 | C | A | C | I | C | I | R | I |
| E09 | I | A | R | I | C | R | C | C |
| E10 | I | C | R | I | A | I | C | I |

Duas linhas merecem atenção: **E10 responde a Security**, não a engenharia — autorização é
decisão de segurança implementada por engenharia. E **E05 responde a Operações**, porque
observabilidade que ninguém opera não é observabilidade.

### 2.3 Cadência

| Ritual | Frequência | Participantes | Saída obrigatória |
|---|---|---|---|
| Barreira de onda | Ao fim de cada onda | Executores + Tech Lead | Handoff no Template 5 |
| Passagem de gate | Ao fim de cada gate | Dono do gate + `critic` se risco high | Evidência de gate no Template 2 |
| Revisão de riscos | Ao fim de cada fase | Produto + Tech Lead + Security | Registro atualizado com gatilhos disparados |
| Retro | Mensal, ou após 3 ocorrências do mesmo defeito | Todos | Delta de regra/skill/registry como PR (skill `retro`) |
| Decisão de perfil | Antes de F1 e revisada antes de F5 | Produto + Tech Lead | Perfis liberados e não suportados, por escrito |
| Revisão pós-liberação | Semanal durante adoção controlada | Operações + Tech Lead | Continuar / pausar / reverter |

### 2.4 Escalonamento

| Situação | Vai para | Prazo | Se não houver resposta |
|---|---|---|---|
| Gate reprovado duas vezes na mesma tarefa | Tech Lead | mesma onda | Tarefa é replanejada, não reexecutada |
| Achado de segurança bloqueante | Security → Produto | 24h | Gate permanece bloqueado |
| Campo operacional pendente na véspera da liberação | Produto | antes da liberação | Perfil não é liberado |
| Divergência de decisão entre papéis | Tech Lead; se persistir, Produto | 48h | Registrada como ADR com a posição vencida documentada |
| Limite de erro/latência/custo excedido em adoção | Operações | imediato | Expansão da adoção é interrompida |

**Loop de reparo limitado:** duas tentativas de correção por check, uma escalada de tier de
modelo, e então parar e reportar vermelho (`registries/policy.json` `repair`). Esgotar o
limite reporta vermelho honestamente — nunca reporta pronto. Isso é regra do próprio
EngineOS aplicada ao desenvolvimento do EngineOS.

### 2.5 Definition of Done

Uma tarefa está pronta quando **todas** valem:

1. Objetivo observável é verdadeiro no sistema, não no documento.
2. Aceite verificável tem teste, e existe um teste que falha quando o controle é removido.
3. Evidência é reexecutável por terceiro: comando, commit, `config_version`, data.
4. Itens não medidos estão listados explicitamente.
5. Rollback está descrito, e sua segurança em relação aos dados foi avaliada.
6. Limitações conhecidas estão escritas onde alguém que anuncia a capacidade vai ler.
7. Change record fechado (`skills/record-change`), com spec vinculada quando o limiar exigiu.
8. Superfície pública alterada seguiu `docs/COMPATIBILITY.md`.

Uma fase está pronta quando todas as suas tarefas estão prontas **e** a condição de saída da
fase, em `02-sequenciamento.md`, foi demonstrada — não deduzida da soma das tarefas.

### 2.6 O que a governança não deve fazer

- Não converter ausência de dado em sucesso.
- Não usar conclusão de tarefas como prova de prontidão.
- Não aceitar configuração declarativa como prova de bloqueio: a prova é a chamada negada.
- Não reduzir meta silenciosamente após a adoção; alterar meta preserva a evidência anterior.
- Não publicar release, hospedar console ou disparar chamada paga pela existência de um
  plano. Esses passos acontecem na tarefa e com a autorização correspondentes.
