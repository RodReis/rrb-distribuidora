# Homologação — M1, M2 e M3

Estado em 02/11/2026. Legenda: ✅ provado localmente · 🟡 parcial · ⬜ depende de você.

## O que já está provado (banco e build locais)

| Item | Evidência |
|---|---|
| Testes automatizados | 267 passam, incluindo os de integração com Postgres (`$env:RUN_DB_TESTS="1"; pnpm exec vitest run`) |
| M2: consistência da matriz preditiva | 5 consultas SQL com 0 violações (cobertura × status, sugestão de compra, ABC/XYZ, produtos sem métrica, saldo negativo) |
| M2: código de retalho sem colisão | 6 criações em paralelo, sem repetição (sequência `remnant_code_seq`) |
| M2: reservar, liberar e descartar retalho | Smoke ao vivo no navegador como admin; botões falsos removidos (Mill Cert, Nesting, impressão ZPL) |
| M2: perfis sem escrita | Não veem botões de escrita nem as abas Inventário e Carga Inicial |
| M3: expiração automática | Teste de integração: expira só `enviado`/`em_negociacao` vencidos, devolve o retalho, audita como sistema, é idempotente |
| M3: peso | NBR 7480 (9 bitolas de CA-50) e chapas (5 espessuras), erro < 0,5% |
| Latência (build local, dados pequenos) | `/mercado` 130–250 ms, `/dashboard` ~115 ms, `/estoque` ~120–160 ms, `/vendas/orcamentos` ~85 ms |

## Dados de demonstração em produção (02/11/2026)

A pedido do PI, foram criados dados fictícios no tenant de produção para exercitar M2, M3 e M4 sem dados reais. Tudo leva **DEMO** no nome, no lote ou nas notas. Os CNPJs são fictícios (`999000000001xx`, `999000000002xx`).

| O quê | Quantidade |
|---|---|
| Produtos novos (além dos 3 existentes) | 8, `SKU-CG-0002`, `SKU-CG-0003`, `SKU-BOB-0002`, `SKU-BOB-0003`, `SKU-PER-0001`, `SKU-BAR-0001`, `SKU-BAR-0002`, `SKU-TUB-0001` |
| Depósitos / fornecedores / clientes / máquinas | 2 / 3 / 4 / 5 |
| Lotes (via importador oficial de CSV) | 12, valor R$ 193.321,97, lotes `DEMO-*` |
| Histórico de consumo | 705 movimentos de saída nos últimos 90 dias |
| Retalhos | 5, `RET-00001` a `RET-00005` |
| Orçamentos (via serviço oficial) | 5: aprovado (virou pedido), enviado, em negociação, bloqueado por margem e perdido |
| Situação de estoque resultante | 2 críticos, 2 em atenção, 7 saudáveis |

**Efeito colateral nos produtos que já existiam:** o importador atualiza o custo de reposição de cada produto com o custo do lote. Por isso o custo de `SKU-CG-0001`, `SKU-BOB-0001` e `SKU-INX-304-200` mudou. Para voltar aos valores anteriores: R$ 5,36/kg, R$ 4,71/kg e R$ 24,90/kg.

**Como remover** (rode no Postgres de produção, na ordem; apaga só o que é DEMO):

```sql
delete from sales_orders where quote_id in (select id from quotes where notes like 'DEMO%');
delete from quote_items where quote_id in (select id from quotes where notes like 'DEMO%');
delete from quotes where notes like 'DEMO%';
delete from stock_movements where lot_id in (select id from stock_lots where lot_number like 'DEMO-%');
delete from stock_remnants where notes like 'DEMO%';
delete from stock_lots where lot_number like 'DEMO-%';
delete from stock_predictive_metrics where product_id in (select id from products where sku in ('SKU-CG-0002','SKU-CG-0003','SKU-BOB-0002','SKU-BOB-0003','SKU-PER-0001','SKU-BAR-0001','SKU-BAR-0002','SKU-TUB-0001'));
delete from products where sku in ('SKU-CG-0002','SKU-CG-0003','SKU-BOB-0002','SKU-BOB-0003','SKU-PER-0001','SKU-BAR-0001','SKU-BAR-0002','SKU-TUB-0001');
delete from customers where notes = 'DEMO';
delete from machines where name like '%(DEMO)';
delete from suppliers where notes = 'DEMO';
delete from warehouses where name like '%(DEMO)';
update products set replacement_cost_base = 5.36 where sku = 'SKU-CG-0001';
update products set replacement_cost_base = 4.71 where sku = 'SKU-BOB-0001';
update products set replacement_cost_base = 24.90 where sku = 'SKU-INX-304-200';
```

Depois rode o recálculo (`POST /api/internal/jobs/calculate-predictive-stock`). A trilha de auditoria e o contador de código de retalho (`remnant_code_seq`) não são desfeitos.

**Não são dados reais.** Margens, preços e consumo servem para testar o sistema, não para decidir compra ou venda.

## O que depende de você

### M1: Mercado
- ⬜ Chave da API de metais (`COMMODITY_PRICE_API_KEY`/`METALS_API_KEY`), o mapeamento do mercado (HRC) e a licença do provedor.
- ⬜ Simulador de importação contra uma DI ou planilha real (critério: erro < 0,1%).
- ⬜ Domínio no Resend para testar o e-mail de alerta de verdade.

### M2: Estoque
- ⬜ Credenciais do Cloudflare R2 e um teste real de upload/download (débito OR1).
- ⬜ Dados reais: o dev tem 11 produtos e os 5 SKUs críticos estão com estoque zero.
- ⬜ Tabela de peso de usina com 10–20 SKUs reais (OR6).

### M3: Orçamentos
- ⬜ **Decisão:** confirmar que só `enviado` e `em_negociacao` expiram sozinhos (OR4).
- ⬜ Dados reais de cliente e orçamento para homologar preço e margem.

### Produção (Railway)
- ✅ Deploy de web e `market-worker` em 02/11/2026 (PR #8); migrations `0006` a `0008` aplicadas (9 no total); jobs de expiração, estoque e PTAX respondem 200 com o token e 401 sem ele.
- ⬜ Observar as execuções automáticas nos horários: PTAX, metais, estoque 04:00, briefing 06:55 e expiração de hora em hora.
- ⬜ Testar o job do briefing em produção (envia e-mail e usa a OpenAI, por isso não foi disparado sem a sua autorização).
- ⬜ Reparo `pnpm db:fix-replacement-cost`: só se houver lotes antigos. Produção está sem lotes, então não é necessário agora.
- ⬜ Medir a latência na infraestrutura real. Os números locais não valem como aceite.

### M4 (relacionado)
- ✅ Termos de uso: versão 1.0 aprovada pelo PI (`termos-de-uso-ia.md`), aceite no primeiro acesso e aba na governança (spec M4 §10.9).
- ⬜ O PI revisar as 20 perguntas da bateria do Copiloto.

## Achados que pedem decisão sua
1. `calcular_impacto_aumento_insumo` soma todas as cotações abertas, de qualquer família, ao valor de estoque da família pedida. Corrigir muda uma regra de cálculo.
2. Opcional: aviso de "valor suspeito" no campo de custo do lote.
