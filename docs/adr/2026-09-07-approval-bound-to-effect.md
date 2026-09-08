# Aprovação humana vinculada ao efeito, não à sessão

Date: 2026-09-07
Status: proposed

Source: "EngineOS 2.0 — Plano de adequação para produção" (06/09/2026, rev. 2), épicos E04 (aprovação persistida) e E10 (autorização na fronteira). Estende `2026-09-03-hitl-as-kernel-entity.md`, que fez do HITL uma entidade do kernel sem definir o que uma aprovação vincula.

## Context

O kernel já responde se um humano é necessário e por qual razão, a partir de um vocabulário fechado. O que ele não define é o que a resposta "sim, aprovado" cobre. Sem isso, três coisas ficam em aberto, e todas são falhas de segurança e não de ergonomia:

- Um agente pode obter aprovação para uma ação barata e reutilizá-la para uma cara.
- Uma aprovação obtida antes de um `pause` pode ser reaproveitada depois do `resume`, quando a permissão já foi revogada.
- Uma aprovação pode ser pedida duas vezes para a mesma ação, o que treina o operador a aprovar sem ler — o modo de falha mais caro dos três, porque destrói o valor de todos os gates.

## Options considered

1. **Aprovação vinculada à tupla (ação, argumentos, destino, `config_version`)** (escolhida).
   - Pros: mudar qualquer elemento invalida a aprovação, então não existe reuso silencioso; a mesma tupla não é perguntada duas vezes, então o operador lê o que aprova; a aprovação é auditável — o registro diz exatamente o que foi permitido, não "o usuário disse sim às 14h".
   - Cons: um argumento que muda de forma inócua (um retry com o mesmo efeito) invalida a aprovação e pode gerar nova pergunta. Mitigação: a chave de idempotência do efeito, não o texto do argumento, é o que entra na tupla quando o efeito declara uma.

2. **Aprovação por sessão ou por janela de tempo** (rejeitada).
   - Pros: menos interrupção; trivial de implementar.
   - Cons: é exatamente a escalada de privilégio que o gate existe para impedir. "Aprovado nos próximos 30 minutos" significa que o próximo efeito irreversível não foi aprovado por ninguém.

3. **Aprovação por classe de risco** (rejeitada).
   - Pros: alinha com `gates.by_risk`, que já existe.
   - Cons: a classe é o que decide *se* perguntar, não o que a resposta cobre. Duas ações de risco alto e efeitos completamente diferentes compartilhariam uma aprovação.

## Decision

Opção 1. Uma aprovação registra `{ação, argumentos ou chave de idempotência, destino, config_version, quem, quando, razão do vocabulário HITL}` e é válida apenas para essa tupla.

- **Invalidação:** qualquer alteração na tupla invalida. Revogação de permissão invalida aprovações pendentes, inclusive de execuções retomadas.
- **Não repetir:** uma aprovação válida para a mesma tupla não é perguntada de novo.
- **Reverificação na execução:** a autorização é checada de novo no momento do efeito, inclusive após `pause`/`resume`. Aprovação não substitui autorização; são gates distintos.
- **Escopo por tipo de efeito:** leitura, escrita reversível e efeito irreversível são categorias diferentes. Uma aprovação de escrita reversível não cobre um efeito irreversível.
- **Credenciais ficam fora do contexto do modelo.** A aprovação autoriza uma ação; ela não entrega segredo a um prompt.

## Consequences

- Configuração declarativa não é prova de bloqueio. Um teste que demonstre a ação sendo negada na fronteira real é o que fecha este gate — checagem que só existe em JSON não conta.
- O registro de mudança (`.engineos/changes/`) já tem a seção "Human decisions" com o vocabulário de `policy.json hitl.reasons`; ela passa a ser a forma humana deste mesmo contrato. Um tier que exigiu humano e não registra nada não passou pelo gate.
- Enquanto E04 não persistir aprovações ligadas a efeitos, o produto tem gates escritos e não gates aplicados, e `docs/CAPABILITIES.md` deve dizer isso.
