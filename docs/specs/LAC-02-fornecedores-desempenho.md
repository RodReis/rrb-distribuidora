# SPEC LAC-02 — Fornecedores, lead time e desempenho

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** implementação técnica concluída após decisões do PI (03/11/2026) · **Dependências:** M0, M2, LAC-01

## Objetivo

Registrar fornecedores preferenciais por produto, lead time específico, histórico de entrega e indicador OTIF sem inferir dados ausentes. Preferência por família fica para etapa futura.

## Regras

- A preferência é tenant + produto + fornecedor; no máximo um fornecedor preferido ativo por produto e período de vigência. Preferência por família fica fora desta entrega. Sem preferência, mostrar “não definido”; fontes legadas do M2 só podem aparecer identificadas como estimativa.
- Lead time específico prevalece sobre o lead time geral do cadastro M0. Ausência retorna `unknown`, nunca o default numérico do código. Alterações têm vigência e autor.
- Uma entrega é o conjunto de itens de PC recebido contra pedido LAC-01. Pontualidade compara data efetiva completa com a promessa original confirmada. Reprogramação não substitui a promessa original; essa política pode ser reavaliada depois. Entrega completa compara quantidade recebida e pedida, com tolerância zero.
- OTIF = entregas completas e pontuais / entregas elegíveis no período. Canceladas antes da promessa e entregas sem data confirmada ficam fora do denominador e são contadas à parte; amostra zero ou incompleta mostra “sem dados”, não 0%.
- Mudança da data prometida exige evento datado; preserva promessa original e revisões para não apagar atraso histórico.
- O indicador considera os últimos 90 dias civis, inclusivos, calculados no servidor no fuso `America/Sao_Paulo`.
- Condições são imutáveis após registro. Revisões criam nova versão, encerram a vigência anterior e preservam o histórico.
- Lote mínimo é uma quantidade positiva expressa na unidade cadastrada do produto. Sem conversão automática entre unidades; nulo significa que não há mínimo configurado.

## Modelo lógico

`product_supplier_terms(tenant_id, product_id, supplier_id, preferred, lead_time_days nullable, minimum_order_qty nullable, unit, valid_from, valid_until, changed_by, created_at)`; `supplier_delivery_events(tenant_id, purchase_order_id, item_id, event_type, promised_at, event_at, quantity, actor_id, source)`. Constraints/FKs incluem tenant. Conflitos de vigência/preferência são serializados por produto na transação de escrita; índices suportam consultas por tenant, produto, fornecedor e pedido.

## Rotas e permissão

Área `/fornecedores` com painel por fornecedor (`supplier.read`); `/api/suppliers/:id/performance` GET; `/api/product-supplier-terms` GET (`supplier.read`), POST para nova condição e PATCH para criar uma nova versão (`supplier.configure_terms`). Eventos são gravados junto às transações de emissão, confirmação/reprogramação, recebimento, estorno e cancelamento de LAC-01.

## Aceite

- Configurar fornecedor preferido e lead time de produto não altera cadastro geral nem dados históricos.
- Sem condição preferida, o fornecedor preferido permanece ausente; fontes legadas do M2, quando usadas, precisam retornar origem explícita e rótulo de estimativa.
- Fixture com 8 entregas (4 OTIF, 2 atrasadas, 1 incompleta, 1 sem promessa) resulta em 4/7 = 57,14%, com a sem promessa exibida fora do denominador; zero amostra mostra “sem dados”.
- Troca de data prometida preserva valor original e justifica alteração.
- Revisar condição encerra a vigência anterior e cria nova linha histórica; outra preferência por produto pode assumir a partir da mesma data.
- Lote mínimo em unidade diferente da unidade do produto é rejeitado; condição sem mínimo não exige unidade.
- Recebimento parcial não conta como entrega completa; segundo recebimento dentro da promessa pode completar a entrega conforme regra temporal registrada.
- Usuário de outro tenant não lê nem modifica termos/histórico.

## Tela e fora de escopo

CRUD de condições por produto e painel com OTIF, volume de amostra, período, lead time observado e incompletudes. Fora: RFQ, cotações comparativas, APIs de fornecedor e pontuação opaca.

## Implementação técnica validada (03/11/2026)

- Migration cria condições por produto × fornecedor e eventos de entrega tenant-safe; métricas M2 aceitam lead time nulo e gravam origem.
- Resolução M2 prioriza condição vigente do fornecedor preferido, depois cadastro M0 do fornecedor, e por último primeiro lote como **estimativa legada rotulada**; ausência de toda fonte numérica fica `SEM_LEAD_TIME`.
- API GET/POST/PATCH de condições e API GET de desempenho aplicam capabilities explícitas, escopo de tenant e validações de vigência. PATCH cria uma versão e encerra a anterior; registros históricos não são sobrescritos.
- Cadastro de condições por produto e painel dos últimos 90 dias estão na área de fornecedores. M0 geral continua separado; acesso à escrita do cadastro legado segue a permission M0 existente.
- Emissão, confirmação/reprogramação, recebimento, estorno e cancelamento alimentam eventos LAC-02 na mesma transação de origem.
- Correção manual usa `POST /api/supplier-delivery-events/:eventId/corrections` (`supplier.correct_events`, admin e comprador); tenant, pedido e evento são validados, justificativa exige 10 caracteres, data futura é rejeitada e a correção fica no audit log. FK composta impede compensação entre tenants ou pedidos.
- Painel de desempenho exibe histórico expandível e permite corrigir data, promessa ou quantidade/item conforme o tipo. Evento substituído permanece visível e identificado; a substituição assume seu lugar no cálculo OTIF.
- OTIF agrega recebimentos por entrega/recebimento, preserva promessa original e revisões, tolerância zero, sem promessa fora do denominador e amostra zero como `null`.
- Fixture de aceite OTIF (4/7 = 57,14%), amostra vazia, recebimentos parciais/estornos, janela de 90 dias, correções compensatórias, versionamento, isolamento de tenant e unidade do lote mínimo têm cobertura. Typecheck, build, testes e estado da migração atualizados após validação desta entrega.
- Smoke HTTP da rota autenticada confirmou redirecionamento para login. Smoke visual autenticado não foi executado nesta sessão.

## Limitações

- Interface permite criar e versionar condições por início de vigência; ainda não permite programar o fim de uma vigência futura sem criar outra versão.
- Eventos operacionais e correções são append-only. Cada evento pode ter uma substituição direta; a substituição também pode ser corrigida depois, mantendo cadeia auditável. Justificativa explica o motivo, sem edição/exclusão do original.
- A origem `supplier_record` pode ser valor M0 preenchido pelo default legado; interface identifica a fonte, mas M0 não distingue valor manual de default histórico.

## Decisões registradas pelo PI

- Preferência por produto nesta entrega; preferência por família fica para depois.
- Tolerância zero para completude.
- Indicador com janela de 90 dias.
- Reprogramação não troca a data prometida original; reavaliar a política depois.
- Condições não são sobrescritas: toda revisão cria uma nova versão auditável.
- Admin e comprador podem criar e revisar condições; demais papéis autorizados têm consulta.
- Lote mínimo é positivo e usa a unidade do produto; não há conversão automática.
