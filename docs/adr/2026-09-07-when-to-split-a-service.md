# Critérios para extrair um processo ou serviço separado

Date: 2026-09-07
Status: proposed

Source: "EngineOS 2.0 — Plano de adequação para produção" (06/09/2026, rev. 2), seção 4 e épico E09. Complementa `2026-09-04-typescript-runtime-over-bash.md`, que decidiu a linguagem do núcleo, não a topologia.

## Context

O plano prevê filas, workers e execução distribuída (E09), mas também diz — corretamente — que componentes distribuídos devem ser implementados **quando exigidos pelas capacidades assumidas**, e não como pré-requisito universal de um framework de produção. Sem um critério escrito, essa frase resolve nada: toda equipe acha que a sua capacidade exige.

O risco aqui é simétrico e vale nomear os dois lados. Extrair cedo demais compra latência de rede, um contrato a versionar, um modo de falha parcial e uma superfície de operação, tudo antes de existir carga que justifique. Extrair tarde demais deixa uma tarefa longa bloqueando o processo interativo e obriga a reescrever sob pressão de incidente.

## Options considered

1. **Módulos claros num runner local; extração quando um gatilho declarado dispara** (escolhida).
   - Pros: a fronteira do módulo é o trabalho que a extração vai exigir de qualquer jeito, e ela é barata agora; o gatilho torna a decisão verificável em vez de opinativa; o perfil local — que é uso de produção legítimo — não paga por infraestrutura que não usa.
   - Cons: exige disciplina para manter a fronteira limpa sem a pressão que a rede imporia. Um módulo que compartilha estado por variável global não vira serviço sem reescrita, e nada avisa.

2. **Serviços separados desde o início** (rejeitada).
   - Pros: a fronteira é aplicada pela rede; escalar depois é configuração.
   - Cons: o perfil declarado hoje é instalação local em `~/.claude` para 2–10 pessoas. Introduzir fila, broker e workers aí adiciona modos de falha que o produto não tem, e o plano é explícito em não obrigar migração de stack sem requisito registrado.

3. **Decidir caso a caso, sem critério escrito** (rejeitada).
   - Pros: flexibilidade.
   - Cons: na prática significa que a decisão é tomada pela pessoa que estiver com o teclado, e o histórico não explica por quê.

## Decision

Opção 1. O núcleo começa como módulos dentro de um runner local. Um módulo é extraído para processo ou serviço separado quando **pelo menos um** destes gatilhos é observado e registrado com dado, não com expectativa:

| Gatilho | Como se mede | Por que justifica |
|---|---|---|
| **Concorrência** | Tarefas enfileiradas esperando enquanto há capacidade ociosa, medido em telemetria (E05) | O processo único virou o gargalo; escalar exige paralelismo real |
| **Isolamento de falha** | Uma falha do módulo derruba ou trava o resto do runner | Contenção que só um limite de processo dá |
| **Implantação independente** | O módulo precisa mudar em cadência diferente do núcleo, com evidência de releases bloqueadas | Acoplamento de implantação já está custando |
| **Perfil de recurso** | Necessidade de memória, GPU ou tempo de execução incompatível com o processo interativo | Coabitação degrada o caminho interativo |
| **Fronteira de segurança** | Necessidade de rodar sob credencial ou rede diferente da do núcleo | Menor privilégio exige separação real |

Preferência linguística, elegância arquitetural e "vamos precisar um dia" não são gatilhos.

## Consequences

- Enquanto nenhum gatilho dispara, E09 permanece **planejado** e o perfil distribuído não é liberado — recurso incompleto fica desabilitado e explicitamente não suportado.
- Todo módulo é escrito para poder ser extraído: comunicação por contrato versionado, sem estado compartilhado implícito, com erros tipados. O custo dessa disciplina é o preço de não decidir a topologia cedo.
- Quando um gatilho disparar, a extração entra por E09 com o que o épico exige: lease e heartbeat, idempotência por efeito, outbox onde uma transação precisa publicar evento, e teste de recuperação com worker morto após o efeito externo e antes do ack.
- Um worker Python só entra se um requisito de integração ou operação o justificar, consumindo o mesmo contrato versionado — a decisão de linguagem do núcleo (`2026-09-04-typescript-runtime-over-bash.md`) não é revista por conveniência.
- Fila não garante *exactly-once*. Qualquer garantia anunciada precisa dizer o que é realmente idempotente e onde não é.
