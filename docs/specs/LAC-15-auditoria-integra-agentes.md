# SPEC LAC-15 — Auditoria íntegra de agentes e decisões

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** proposta de backlog, não implementada · **Dependências:** M0, M4, LAC-01, LAC-13

## Objetivo

Provar quem/qual processo executou uma ação, com quais dados e tools, qual resultado ocorreu e que aprovação humana a autorizou, resistindo a alteração posterior conforme ameaça definida.

## Modelo de ameaça e invariantes

- A tabela append-only no mesmo Postgres não é considerada imutável contra administrador DB. A garantia proposta combina eventos encadeados por hash, chave em serviço separado, checkpoints assinados e cópia/retention externa com acesso restrito. PI/segurança precisa escolher serviço e retenção.
- Registrar identificador de ator humano/sistema/agente, tenant, correlação, sessão, modelo/prompt versionados quando aplicável, tool e versão, resumo/identificadores de entradas, resultado/status, instante, aprovação e vínculo de entidade. Capturar falha, negação e cancelamento também.
- Minimização: não gravar senha, token, chave de API, dados bancários/PIX, conteúdo pessoal desnecessário ou chain-of-thought privado. Entrada/saída conversacional segue política própria de retenção e acesso; log de ação não equivale a log irrestrito de raciocínio.
- Evento de domínio e aprovação não são apagados; correção gera evento compensatório. Acesso/consulta/exportação da auditoria também gera evento.
- Falha do destino externo não pode ser silenciosa: fila local durável, estado degradado, alerta e política de bloqueio para ações de alto risco (compras, financeiro, escrita).

## Dados e pipeline

`audit_events(id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, correlation_id, occurred_at, payload_minimized, prev_hash, event_hash, key_version, chain_partition)`; `audit_checkpoints(partition, sequence, root_hash, signature, external_receipt, stored_at)`; `audit_access_events` para consultas/exportações.

Hash cobre canonicalização versionada do evento anterior + campos imutáveis + identificador de partição. Segredo de assinatura não fica no banco/app. Partições e tenant são verificadas em cadeia; checkpoint externo independente permite detectar reescrita completa da tabela.

## API/permissões

Eventos gravados por serviço de auditoria, não CRUD público. `GET /admin/auditoria` filtra por intervalo/ator/ação/entidade e exporta com `audit.read/export`; ver payload detalhado exige capability separada. `POST /internal/audit/verify` executa verificação controlada e retorna intervalo/checkpoint, divergências e horário, sem material de chave.

## Aceite

- Reordenação, alteração, remoção ou inserção retroativa em fixture de eventos é detectada na validação da cadeia/checkpoint externo.
- Retry idempotente não duplica evento lógico; eventos concorrentes mantêm encadeamento consistente.
- Falha do provedor de checkpoint coloca ação sensível em estado configurado de bloqueio/degradação e alerta; nunca afirma “auditada” sem persistência durável.
- Negação, falha de provedor LLM, cancelamento e tool executada aparecem com correlação; segredos/testes-canário não aparecem em payload/log.
- Alteração de hash/configuração de canonicalização exige nova versão e não invalida silenciosamente cadeias anteriores.
- Usuário sem permissão não lê/exporta; leitura autorizada registra leitor, filtro, volume e instante.
- Retenção/expurgo segue política aprovada com checkpoint/evidência de descarte, sem apagar sob pedido comum uma trilha sujeita a retenção.

## Limites e decisões

Não promete invulnerabilidade contra conluio entre todos os administradores e o custodiante da chave. PI/segurança decide modelo de ameaça, provedor externo, chave/KMS, período de retenção, acesso, dados de conversa, bloqueio de operação em falha e processo legal de expurgo. Até isso, trilha M4 é evidência operacional, não declarar imutável.
