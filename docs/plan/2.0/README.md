# EngineOS 2.0 — Plano de execução

Derivado de `EngineOS 2.0 — Plano de adequação para produção` (rev. 2, 06/09/2026).
Referência do working tree: commit `fed9a63`.

| Documento | O que resolve |
|---|---|
| [`01-decomposicao-epicos.md`](01-decomposicao-epicos.md) | E01–E10 quebrados em 113 tarefas com escopo em arquivos reais, dependência, risco, autonomia, gate, aceite verificável e evidência |
| [`02-sequenciamento.md`](02-sequenciamento.md) | Grafo de dependências, caminho crítico, ondas paralelizáveis por fase, marcos A/B/C e roteiro de validação integrada |
| [`03-templates-evidencia.md`](03-templates-evidencia.md) | Seis templates: task card, evidência de gate, checklist operacional por perfil, relatório de prontidão, handoff e registro de não medido |
| [`04-riscos-governanca.md`](04-riscos-governanca.md) | 30 riscos com gatilho observável e dono, RACI por épico, cadência, escalonamento e definition of done |
| [`05-arquitetura-contratos.md`](05-arquitetura-contratos.md) | Contrato mínimo de cada componente, ancorado no que existe hoje e no que falta |

## Estado

Plano de implementação. Nenhuma alteração de código, publicação de release ou chamada paga
foi executada — nem deve ser, apenas pela existência destes documentos.

## As três coisas que decidem o resultado

1. **`E01-T3` e `E01-T4` primeiro.** Perfis de implantação e matriz de capacidades definem
   o que a release é. Sem eles, todo o resto vira escopo aberto — e o plano já classifica
   isso como o risco de maior exposição (R03).

2. **Enforcement anunciado e ausente é o defeito estrutural.** O kernel decide bem e nada
   obedece; o console mostra `enabled=false` e o runtime chama assim mesmo. `E01-T13`
   (rastreabilidade regra → aplicação → teste), `E04-T3/T4/T7` e `E03-T15` existem para
   fechar isso, e cada um exige um teste que **falha quando o controle é removido**.

3. **Papéis sem pessoas travam o plano.** Todo responsável neste documento é um papel
   proposto. Nenhuma onda deveria iniciar sem nome atribuído, e os valores de SLO, RPO, RTO
   e retenção continuam pendentes — cada um bloqueia a liberação do perfil correspondente.

## Já medido nesta sessão

Uma medição executada em 06/09/2026 adianta parte de `E01-T1`: o working tree difere de
`HEAD` em 512 arquivos por diff bruto e em **zero** ignorando CR e espaço — não há
divergência semântica. `scripts/validate-engineos.sh` dá 90 ok / 18 FAIL neste checkout
Windows e 108 ok / 0 FAIL em cópia normalizada de `git archive HEAD`. A causa é CRLF em
arquivos que `.gitattributes` não cobre, o que confirma `E02-T3` e fixa seu escopo.
Detalhe e ressalvas em `01-decomposicao-epicos.md`, seção E01.

## Spec de F0

`docs/specs/2026-09-06-f0-baseline-and-distribution-design.md` — design de E01+E02 no formato
da casa: allowlist e denylist do empacotador, contrato do manifesto, política de EOL e de modo
de arquivo, precondições do instalador, roteiro de 13 passos do teste E2E do artefato, matriz
de CI e sete decisões (D1–D7) que dependem do responsável pelo produto.

## Primeira unidade de execução

`E01-T1` — identificar o snapshot canônico e classificar as diferenças do working tree em
semânticas, fim de linha e modo de arquivo. Nada mais começa antes disso.

Em seguida `E02-T1` e `E02-T8`: produzir e testar o primeiro artefato reproduzível, sobre os
bytes finais, antes de ampliar console ou runtime.
