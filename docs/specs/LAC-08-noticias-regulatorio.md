# SPEC LAC-08 — Notícias, sentimento e feed regulatório

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** curadoria manual implementada; sem coleta, LLM ou alertas automáticos · **Dependências:** M1, LAC-06; LAC-13 e LAC-15 ainda pendentes

## Objetivo e limites

Exibir notícias de mercado classificadas como contexto e publicações regulatórias com fonte, jurisdição e vigência. LLM pode sugerir tema/sentimento, mas não decide validade legal, incidência tributária ou ação operacional.

## Regras

- Fonte tem licença, URL/identificador, publicação, captura, direitos de exibição e política de retenção cadastrados. Sem permissão, mostrar metadados mínimos permitidos ou omitir.
- Ingestão mantém hash e deduplica por fonte/ID/hash; original não é alterado. Correções viram nova versão/evento.
- Classificação guarda modelo/prompt/versionamento, trecho evidencial permitido, rótulo, confiança e status humano; erro de modelo não bloqueia acesso à fonte.
- Registro regulatório contém autoridade, ato, jurisdição, assunto, publicação, início/fim de vigência quando confirmados, revogação/alteração e revisor. Campo desconhecido = indeterminado; LLM não preenche data ou alcance jurídico.
- Alertas levam ao documento primário e descrevem “possível relevância”, sem afirmar aplicação ao produto/empresa sem validação especializada.

## Dados/rotas e aceite

`news_sources`, `news_items(source_id, external_id, canonical_url, published_at, captured_at, content_hash, rights_policy)`, `news_classifications(item_id, model_version, labels, sentiment nullable, confidence, evidence, reviewed_by, reviewed_at)`, `regulatory_items(authority, act_id, jurisdiction, published_at, effective_from nullable, effective_until nullable, status, primary_source_url, reviewed_by)`.

`GET /mercado/noticias`; `/api/news/:id/review` e `/api/regulatory` exigem papéis/capabilities específicos.

- Mesma fonte/ID não duplica; alteração preserva versões/hash.
- Sem licença para conteúdo completo, API/UI não retorna corpo integral.
- Publicação sem vigência confirmada aparece `vigência indeterminada` e não dispara regra de preço/fiscal automática.
- Classificação apresenta origem, modelo, confiança e revisão; saída LLM não se faz passar por texto oficial.
- Toda alteração humana/regulatória tem autor e timestamp e permissões de tenant.

Fora: parecer jurídico, cálculo fiscal, coleta de portais sem autorização e operação de compra automática. PI/assessoria decide fontes, licenças, jurisdições, revisores, limiar de confiança e política de correção/retirada. Sem isso, feed fica desligado.

## Decisões delegadas pelo PI em 05/11/2026

- **Fontes e licenças:** nenhum fornecedor ou portal pré-cadastrado. Administrador registra URL, referência da autorização e política de retenção antes do primeiro item. Exibição limitada a título, data, origem e link; corpo integral não é coletado nem publicado. Sem fonte autorizada, feed permanece vazio.
- **Hash da captura:** como a ingestão é só de metadados, `content_hash` representa título, URL canônica, data informada e marca de retirada. Não é hash do texto original do portal.
- **Jurisdição:** texto explícito informado pelo administrador para cada ato, sem inferência por IA. Não há lista presumida de jurisdições.
- **Revisores:** somente administrador cadastra e revisa. Diretor pode consultar atos regulatórios; leitores do módulo de mercado podem consultar notícias. LAC-13 poderá substituir essa matriz fixa.
- **Confiança:** classificação manual não tem score ou limiar; `confidence` permanece nulo. Nenhuma classificação automática roda. Revisão humana aprovada é obrigatória para exibir rótulo ou sentimento.
- **Correção e retirada:** notícia e ato recebem nova versão vinculada à anterior. Retirada de notícia registra versão marcada como retirada; ato revogado recebe nova versão com status informado pelo administrador. Histórico não é sobrescrito.
- **Automação:** nenhuma coleta de portais, classificação LLM, alerta, alteração de preço ou cálculo fiscal. Cada ato aponta para documento primário e traz aviso de possível relevância.

## Limites operacionais

Administrador responde por verificar autorização e política de retenção declaradas da fonte. Sistema não interpreta licença nem executa expurgo automático. Auditoria append-only local não substitui cadeia íntegra da LAC-15. Migração 0023 aplicada somente ao PostgreSQL local em 05/11/2026; integração e smoke autenticado desktop/móvel passaram. Produção requer migração própria e revisão de licenças reais antes de cadastrar fontes.
