# SPEC LAC-12 — Parâmetros comerciais, fiscais e dados da distribuidora

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** proposta de backlog, não implementada · **Dependências:** M0, M3, LAC-13

## Objetivo

Cadastrar parâmetros versionados necessários a preço/orçamento e dados oficiais da distribuidora usados em documentos, sem codificar alíquotas ou margens presumidas.

## Regras

- Parâmetros têm escopo explícito, valor/unidade, vigência, fonte, autor, aprovador e versão: margens mínimas por produto/família/cliente; frete/ICMS por UF e contexto aplicável; mapa família→índice/mercado e delta máximo; desconto de retalho; lote mínimo relacionado a LAC-02.
- Precedência (cliente > produto? família?) deve ser aprovada; conflitos/sobreposições bloqueiam cálculo afetado com mensagem “configuração ambígua”. Sem parâmetro não usar default no código nem tratar margem como zero.
- Mudança não recalcula proposta já enviada; rascunhos podem reprecificar com aviso e snapshot da versão antiga/nova.
- Dados da empresa: razão social, nome comercial, CNPJ/IE, endereço, contatos, logo, dados bancários e PIX. Sensíveis são mascarados em tela/lista e acessíveis apenas a papéis configurados; nunca são enviados a LLM ou logs.
- PDF grava snapshot da identidade/configuração vigente no momento de emissão.

## Dados e API

`commercial_parameters(tenant_id, key, scope_type, scope_id, value jsonb, valid_from, valid_until, source, version, created_by, approved_by)`; `company_profiles(tenant_id, legal_data, address, logo_key, payment_details_encrypted, version, verified_at, updated_by)`; histórico imutável de versões.

`/configuracoes/comercial` GET/POST; `/configuracoes/empresa` GET/PATCH; campos de pagamento com resposta mascarada e nunca retornam segredo completo após gravação. Rotas usam `settings.read/configure/approve_sensitive`.

## Aceite

- Sem margem mínima configurada, M3 não afirma “margem mínima cadastrada” nem emite resultado dependente.
- Parâmetro vencido, futuro ou sobreposto é resolvido por vigência sem ambiguidade; mudança preserva cálculo anterior.
- UF sem regra fiscal/frete retorna estado explícito indisponível e não inventa zero.
- Cada PDF usa snapshot identificável; editar cadastro empresarial depois não altera documentos históricos.
- Dados bancários/PIX mascarados em listagem, acessíveis por papel e excluídos de auditoria/telemetria e tools LLM.
- Delta ±20%, desconto 65% e mapa de índice não entram como seed sem aprovação registrada; cobre/latão não recebem índice inferido.

## Fora/decisões

Fora: cálculo tributário legal completo, emissão fiscal e motor de custo importado. PI/comercial/contábil aprova precedência, alíquotas e fontes oficiais, regras por UF/operação, margens, delta, desconto, índices, dados corporativos e papéis sensíveis. Até isso, parâmetros dependentes ficam não configurados e fluxo correspondente bloqueado.
