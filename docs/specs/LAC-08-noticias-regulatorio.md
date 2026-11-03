# SPEC LAC-08 — Notícias, sentimento e feed regulatório

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** proposta de backlog, não implementada · **Dependências:** M1, LAC-06, LAC-13, LAC-15

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
