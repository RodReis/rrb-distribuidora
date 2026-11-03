# SPEC LAC-05 — Exportação de mercado, preço pago e alertas

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** proposta de backlog, não implementada · **Dependências:** M1, LAC-01; análises avançadas LAC-06

## Objetivo

Permitir exportar séries históricas em CSV/XLSX e cruzar preço de mercado com compras reais e médias móveis sem misturar unidades, fontes ou dados manuais/transacionais.

## Regras

- Exportação aplica exatamente filtros, tenant, autorização e fuso horário da consulta; registra quem exportou, filtros e volume, sem duplicar dados além do conjunto solicitado.
- Cada ponto preserva ativo, fonte, timestamp original, moeda, unidade, frequência e indicador de dado corrigido/ausente. CSV UTF-8 com cabeçalho e decimal/documentação de locale; XLSX tipa datas/números sem fórmulas executáveis inseridas de conteúdo externo.
- Compras de LAC-01 só compõem preço pago após recebimento elegível e fórmula aprovada. Até então o campo manual existente é exibido com etiqueta “manual”, data e autor, sem fundir séries.
- Comparações exigem conversão determinística para unidade/moeda comum usando taxa/fonte e timestamp identificados. Sem conversão confiável, mostrar séries separadas.
- Cruzamento de médias exige período, janela, tipo (simples/exponencial) e fonte aprovados; alerta não dispara em histórico insuficiente e inclui dados usados e versão da regra.

## Modelo/rotas

`market_exports(id, tenant_id, user_id, filters, format, row_count, created_at, status)`; `paid_price_observations(tenant_id, product_id, observed_at, value, currency, unit, provenance_type, purchase_receipt_id nullable, manual_user_id nullable, method_version nullable)`; não armazenar agregado duplicado se puder derivar de origem versionada.

`GET /api/market/history/export?format=csv|xlsx`; `GET /api/market/paid-price`; `/api/market/alerts` CRUD exige `market.alert.configure`. Downloads autorizados e expiráveis se arquivo assíncrono.

## Aceite

- Exportar intervalo inclusivo definido retorna exatamente os pontos filtrados, com moeda/unidade/origem; contagem coincide com a tela/API.
- Dados de outro tenant ou ativo sem permissão não aparecem no arquivo.
- Texto malicioso em metadado não vira fórmula de planilha.
- Sem regra aprovada, nenhuma série de compra é rotulada “preço médio”; registro manual mantém proveniência.
- Fixture com preços abaixo/acima da média produz cruzamento apenas na janela configurada; pontos ausentes não são interpolados silenciosamente.
- Exportação grande respeita limite versionado e informa truncamento/falha, sem entregar arquivo parcial como completo.

## Limites/decisões

Fora: inferência de preço de mercado privado, importação de NF-e, contabilização fiscal e cálculo de custo desembarcado. PI decide fórmula média (ponderada por quantidade?), frete/impostos/desconto/devolução, janela, médias, limites de exportação, política de retenção e licenças de redistribuição de dados.
