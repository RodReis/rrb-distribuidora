# SPEC LAC-05 — Exportação de mercado, preço pago e alertas

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** decisões funcionais delegadas pelo PI em 05/11/2026; implementação em PR #16, aceite final pendente · **Dependências:** M1, LAC-01; análises avançadas LAC-06

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

### Decisões do PI — 05/11/2026

- Preço pago transacional = `purchase_receipts.unit_cost` em BRL (formulário de recebimento exige R$), só após recebimento confirmado e não estornado. É preço unitário observado, não custo desembarcado. Desconto, frete e tributos não são acrescentados novamente: o valor informado no recebimento já é a fonte congelada. Devolução/estorno exclui o recebimento inteiro. Moeda do pedido não substitui moeda do custo recebido.
- Média paga, quando exibida, é ponderada pela quantidade recebida, por produto, moeda, unidade e período explícitos; não cruza produtos nem converte unidade/moeda implicitamente. Versão de método `receipt-unit-cost-v1`.
- Dado manual é referência separada, com valor, moeda, unidade, autor e data. Não integra média transacional.
- Cruzamento de médias para alerta usa série diária do próprio ativo, fechamento da mesma fonte, SMA 20 × SMA 50 observações válidas. Exige 51 pontos consecutivos para comparar duas janelas; lacunas interrompem sequência. Regra versionada `market-sma-cross-v1`. Não usa preço pago.
- Exportação síncrona: até 10.000 pontos por arquivo. Acima do limite, erro explícito sem arquivo parcial. Retenção: registrar metadados de auditoria por 365 dias; arquivo não persiste no servidor. CSV UTF-8 com BOM, separador `;`, decimal com vírgula e datas UTC ISO 8601. XLSX mantém tipos numérico/data.
- Uso interno do tenant. Não há autorização para redistribuir dados de fornecedor externo; exportação de ativo com licença não confirmada fica bloqueada até cadastro explícito da permissão de exportação.

### Escopo técnico desta entrega

- A exportação e sua prévia (`GET /api/market/history`) incluem apenas importações manuais novas do tenant autenticado. A tela identifica a contagem dessa seleção; cotações globais de provedores podem aparecer no gráfico, mas não integram esses arquivos. Cada fonte será exportável após licença e vínculo de acesso documentados.
- Linhas manuais antigas na tabela global não têm tenant verificável e permanecem fora da série/exportação privada. Reimportação pelo tenant é necessária; não atribuir autoria retroativamente.
- Sem vínculo explícito produto↔ativo e conversão versionada, preço recebido em BRL e cotações ficam em painéis separados. A referência manual do gráfico é uma linha identificada, não uma média transacional.
- A capability `market.alert.configure` é concedida a admin e comprador, além da permissão de escrita do módulo. Retenção de metadados de exportação: limpeza diária após 365 dias.
