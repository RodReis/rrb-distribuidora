# SPEC LAC-06 — Sazonalidade, correlações e spread histórico

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** proposta de backlog, não implementada · **Dependências:** M1, LAC-05

## Objetivo

Adicionar análises exploratórias reproduzíveis às séries licenciadas e internas: sazonalidade, correlação com defasagem e spread importação × nacional.

## Contrato analítico

- Toda visualização declara ativo/séries, fonte, unidade, período, frequência, conversões, janela, timezone, cobertura e método/versão.
- Sazonalidade agrega por período do calendário apenas quando há quantidade mínima de ciclos aprovada; mostra dispersão e amostra, não só média. Períodos faltantes não são tratados como zero.
- Correlação usa observações alinhadas e defasagem explícita. A tela comunica associação, tamanho de amostra e intervalo/método estatístico; não afirma causalidade.
- Spread exige definições compatíveis de produto, unidade, moeda, Incoterm e componentes incluídos. Importação sem custo landed verificado não é comparável; mostrar “não comparável”.
- Fontes licenciadas respeitam contrato/tenant e não são exportadas para usuários sem direito.

## Dados/rotas

Executar consultas determinísticas sobre `serie_preco_mercado` e observações de LAC-05; `analysis_runs(tenant_id, analysis_type, input_series, parameters, method_version, coverage, result, created_at, source_snapshot_hash)`. `GET /mercado/analises/sazonalidade`, `/correlacao`, `/spread` exige permissão de leitura e validação de acesso a cada fonte.

## Aceite

- Mesma fixture + parâmetros/versionamento geram resultado reproduzível e hash da entrada constante.
- Abaixo do mínimo de ciclos configurado não há afirmação de padrão sazonal; mensagem informa amostra requerida/observada.
- Correlação alinha datas/defasagem declaradas e não preenche buracos com zero; teste inclui série deslocada conhecida.
- Spread recusa unidade, moeda, produto ou Incoterm incompatível; comparação válida mostra componentes e conversão.
- Série não licenciada não aparece em export/tenant sem direito; tentativa é negada e auditada.

## UI, fora de escopo e decisões

Abas de sazonalidade, correlação e spread com aviso metodológico, filtros, cobertura e export conforme LAC-05. Fora: recomendação de compra, causalidade, modelos preditivos do LAC-07 e fontes pagas sem licença. PI decide ciclos mínimos, defasagens disponíveis, fórmulas de spread landed e permissões/licenças. Sem aprovação, análise correspondente permanece indisponível.
