# SPEC LAC-02 — Fornecedores, lead time e desempenho

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** proposta de backlog, não implementada · **Dependências:** M0, M2, LAC-01

## Objetivo

Registrar fornecedores preferenciais por produto (opcionalmente família), lead time específico, histórico de entrega e indicador OTIF sem inferir dados ausentes.

## Regras

- A preferência é tenant + produto + fornecedor; no máximo um fornecedor preferido ativo por produto e período de vigência. Sem preferência, mostrar “não definido”; não usar primeiro lote nem menor lead time como substituto silencioso.
- Lead time específico prevalece sobre o lead time geral do cadastro M0. Ausência retorna `unknown`, nunca o default numérico do código. Alterações têm vigência e autor.
- Uma entrega é o conjunto de itens de PC recebido contra pedido LAC-01. Pontualidade compara data efetiva completa com a data prometida confirmada pelo fornecedor. Entrega completa compara quantidade recebida e pedida; tolerância é zero até decisão comercial explícita.
- OTIF = entregas completas e pontuais / entregas elegíveis no período. Canceladas antes da promessa e entregas sem data confirmada ficam fora do denominador e são contadas à parte; amostra zero ou incompleta mostra “sem dados”, não 0%.
- Mudança da data prometida exige evento datado; preserva promessa original e revisões para não apagar atraso histórico.

## Modelo lógico

`product_supplier_terms(tenant_id, product_id, supplier_id, preferred, lead_time_days nullable, minimum_order_qty nullable, unit, valid_from, valid_until, changed_by, created_at)`; `supplier_delivery_events(tenant_id, purchase_order_id, item_id, event_type, promised_at, event_at, quantity, actor_id, source)`; índice único parcial para preferência ativa por produto. Constraints/FKs incluem tenant.

## Rotas e permissão

`/fornecedores/:id/desempenho` GET (`supplier.read`); `/api/product-supplier-terms` GET/POST/PATCH (`supplier.configure_terms`); evento de entrega vem da emissão/confirmação/recebimento de LAC-01. Deny-by-default; histórico somente leitura após registro, correção por evento compensatório.

## Aceite

- Configurar fornecedor preferido e lead time de produto não altera cadastro geral nem dados históricos.
- Sem preferência/lead time específico, API retorna ausência explícita.
- Fixture com 8 entregas (4 OTIF, 2 atrasadas, 1 incompleta, 1 sem promessa) resulta em 4/7 = 57,14%, com a sem promessa exibida fora do denominador; zero amostra mostra “sem dados”.
- Troca de data prometida preserva valor original e justifica alteração.
- Recebimento parcial não conta como entrega completa; segundo recebimento dentro da promessa pode completar a entrega conforme regra temporal registrada.
- Usuário de outro tenant não lê nem modifica termos/histórico.

## Tela e fora de escopo

CRUD de condições por produto e painel com OTIF, volume de amostra, período, lead time observado e incompletudes. Fora: RFQ, cotações comparativas, APIs de fornecedor e pontuação opaca.

## Decisões pendentes e tarefas

PI decide nível da preferência por família, tolerância de quantidade, janela do indicador, política para reprogramação aceita, autorização para editar condições e lote mínimo por unidade. Implementar após isso: migrations, validação de vigências, integração dos eventos LAC-01, cálculo versionado e revisão da origem do lead time M2.
