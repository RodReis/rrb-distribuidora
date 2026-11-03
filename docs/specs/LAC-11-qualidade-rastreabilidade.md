# SPEC LAC-11 — Qualidade e rastreabilidade de certificados

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** proposta de backlog, não implementada · **Dependências:** M2, LAC-04, storage e LAC-13/LAC-15

## Objetivo

Vincular certificado e evidências de qualidade a lote/corrida, revisar extração OCR e administrar bloqueios/não conformidades com decisões humanas auditáveis.

## Regras

- Original do certificado preservado em storage com checksum, origem, upload, versão e tenant. OCR é sugestão estruturada, nunca fonte final automática.
- Campos extraídos incluem elemento/propriedade, valor, unidade, faixa/tolerância, página/trecho e confiança; revisão humana confirma/corrige cada campo e registra antes/depois.
- Norma/requisito aplicável precisa de referência versionada e aprovador competente. Sem regra ou certificado ausente/inconclusivo, estado é `pendente_validacao`, não conforme nem aprovado.
- Lote bloqueado não pode ser reservado para produção/expedição sem liberação de qualidade com motivo, papel e referência. Liberação não altera o certificado original.
- Não conformidade relaciona lote, requisito, evidências, contenção, responsável e disposição (reprocesso/devolução/uso autorizado) conforme decisão formal.

## Dados/rotas

`quality_documents(tenant_id, lot_id, storage_key, checksum, source, uploaded_by, uploaded_at, status)`; `quality_extractions(document_id, model_version, fields jsonb, reviewed_by, reviewed_at)`; `quality_requirements(product/norm, version, source_ref, criteria)`; `nonconformities(lot_id, requirement_id, status, evidence, disposition, approved_by)`; `lot_quality_events(lot_id, status, actor_id, reason, created_at)`.

`/qualidade/lotes/:id`; `/api/quality/documents` POST; `/review` PATCH; `/block|release` POST; `/nonconformities` CRUD limitado. Capabilities `quality.review/block/release` distintas de estoque.

## Aceite

- Upload, extração e acesso validam tenant e checksum; retry do mesmo arquivo não cria duplicata silenciosa.
- OCR nunca muda lote para liberado; baixa confiança/missing fields exigem revisão.
- Bloqueio impede nova reserva/liberação de produção/expedição; estoque comprometido existente é mostrado e encaminhado para decisão.
- Toda correção registra valor anterior/novo, usuário e evidência; original permanece recuperável conforme retenção.
- Usuário sem capability não libera lote; tentativa fica auditada.
- Requisito sem fonte/versão resulta em `indeterminado` e não bloqueia/aprova por regra inventada.

## Fora/decisões

Fora: certificação automática de norma, parecer técnico por LLM, integração com usina e calibração laboratorial. PI/qualidade define normas, campos obrigatórios, fonte normativa, níveis de confiança, retenção, revisor e fluxos de disposição. Sem revisão/critério, decisão de conformidade não é emitida.
