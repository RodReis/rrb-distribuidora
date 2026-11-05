# SPEC LAC-07 — Sinal composto e backtesting

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** estrutura implementada, cálculo e publicação desligados por decisão do PI em 05/11/2026 · **Dependências:** M1, M2, LAC-05, LAC-06

**Entrega parcial autorizada:** tabelas versionadas e imutáveis, validação estrutural, filtro temporal anti-lookahead, API de consulta e interface de indisponibilidade. `POST /api/market/backtests` responde 409 após autorização de acesso; nenhuma rota cria, ativa ou publica modelo. Migração 0022 ainda precisa ser aplicada ao banco de destino.

## Objetivo

Especificar score de apoio à decisão reproduzível e sua avaliação histórica, substituindo números decorativos de mockup por valores calculados com proveniência.

## Regras

- Score só é exibido quando conjunto de componentes/pesos aprovado, cobertura mínima satisfeita e todos os componentes requeridos disponíveis; caso contrário `indisponível`, nunca preencher faltas com zero sem regra aprovada.
- Score 0–100, sinal textual, horizonte e confiança são derivados por versão de regra; UI mostra composição, entradas, timestamp, dados ausentes e aviso de apoio à decisão.
- Backtest é walk-forward: cada decisão usa apenas dado disponível naquele instante; treino, janela, horizonte, rebalanceamento, universo, benchmark e custos ficam versionados. Sem look-ahead, survivorship bias ou revisão posterior da fonte.
- Resultado inclui série de sinais, retorno/resultado conforme métrica aprovada, benchmark, drawdown, número de observações e limites. Não publicar “economia” sem contrafactual defensável.
- Mudar pesos, fonte ou transformação cria nova versão; histórico não é reescrito.

## Dados/rotas

`signal_models(tenant_id, version, component_config, weights, thresholds, horizon, approved_by, active_from)`; `signal_observations(tenant_id, entity, model_version, score, signal, confidence, components, inputs_hash, as_of)`; `backtest_runs(model_version, dataset_hash, period, methodology, costs, benchmark, metrics, run_at)`.

`GET /mercado/sinais`; `POST /api/market/backtests` apenas analista/admin autorizado; aprovação/publicação requer `market.signal.publish`. Resultado é imutável e reproduzível.

## Aceite

- Reexecução com mesmo snapshot e versão produz o mesmo score e hash.
- Dado futuro inserido na base não altera decisão histórica (teste anti-lookahead).
- Peso ausente ou soma inválida impede ativação do modelo; configuração não aprovada não publica.
- Backtest temporal separa amostras e mostra benchmark, custos, drawdown e cobertura; dataset sem licença/consentimento é rejeitado.
- Interface não mostra valor fixo “82/100” sem registro correspondente e link para execução/modelo.
- Indisponibilidade é representada como tal e não como sinal neutro.

## Fora de escopo/decisões

Não constitui aconselhamento financeiro nem compra automática; fora execução de ordem, hedge e previsão garantida. PI decide componentes, pesos, thresholds, horizonte, confiança, métrica de sucesso, benchmark, custos e protocolo de aprovação. Até então score/backtest fica desligado.
