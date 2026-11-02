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
- ⬜ Deploy do `market-worker` e observação das execuções reais: PTAX, metais, estoque 04:00, briefing 06:55 e expiração de hora em hora.
- ⬜ Aplicar as migrations `0007` e `0008`, e rodar o dry-run `pnpm db:fix-replacement-cost` (`deploy.md` §4.4.1).
- ⬜ Medir a latência na infraestrutura real. Os números locais não valem como aceite.

### M4 (relacionado)
- ⬜ Texto dos termos de uso, que vem do PI.
- ⬜ O PI revisar as 20 perguntas da bateria do Copiloto.

## Achados que pedem decisão sua
1. `calcular_impacto_aumento_insumo` soma todas as cotações abertas, de qualquer família, ao valor de estoque da família pedida. Corrigir muda uma regra de cálculo.
2. Opcional: aviso de "valor suspeito" no campo de custo do lote.
