# SPEC LAC-14 — Confiabilidade, backup, migrations e jobs

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** proposta de backlog, não implementada · **Dependências:** infraestrutura M0–M4 e owner operacional a definir

## Objetivo

Definir operação observável e recuperável: disponibilidade, healthchecks, homologação, backup/restore Postgres, evolução de schema e monitoramento dos jobs PTAX, metais, estoque e briefing.

## SLO e ambiente

- PRD define meta de 99,5%, mas owner, janela e exclusões faltam. Registrar proposta de disponibilidade mensal da aplicação/API crítica, com janela UTC, denominador, política de manutenção e fonte independente; PI/owner operacional deve aprovar antes de reportar SLO como compromisso.
- Health endpoints separados: liveness indica processo ativo; readiness verifica dependências essenciais sem expor segredo nem provocar carga de escrita. Resposta degradada detalha componente apenas para operador autorizado.
- Ambiente de homologação é isolado de produção em credenciais, DB, storage, e-mail e webhooks; dados produtivos não são copiados sem mascaramento/autorização.
- Deploy promove artefato identificado entre ambientes; migração destrutiva não roda sem backup verificado e plano de compatibilidade.

## Backup, restauração e migrations

- Definir RPO/RTO com owner; backups criptografados, retenção, cópia isolada e monitor de sucesso/idade. Restore é testado periodicamente em ambiente isolado e documenta duração, checksum e versão.
- Rollback de schema não significa executar SQL inverso cegamente. Preferir expand/contract e roll-forward; migration destrutiva exige snapshot, compatibilidade e procedimento de recuperação. Dados alterados após migration podem impedir rollback.
- Cada migration tem ID, checksum, dependências, estratégia de lock/duração estimada, compatibilidade app antiga/nova e operador. Deploy interrompido deve deixar estado identificável/reexecutável.

## Jobs

`job_runs(job_name, tenant_id nullable, scheduled_for, started_at, finished_at, status, attempt, correlation_id, input_hash, output_summary, error_class, error_safe, worker_version)`; nunca guardar credenciais/payload sensível nos logs. Jobs idempotentes por nome+tenant+janela; retries com limite/backoff; dead-letter/estado terminal e alerta acionável.

Instrumentar pelo menos PTAX, metais, recálculo de estoque e briefing: início, duração, sucesso/erro, atraso, tentativa, itens afetados e data da última execução válida. Alerta define owner/canal e severidade; stdout isolado não é retenção operacional suficiente.

## Aceite

- Liveness/readiness refletem estado esperado e não vazam variáveis/stack trace.
- Ambiente de homologação prova isolamento de DB/secrets/envios.
- Exercício de restore restaura backup em DB isolado, verifica integridade e mede RPO/RTO; backup não é considerado válido só por arquivo existir.
- Migration interrompida é detectável; pipeline impede migration destrutiva incompatível com versão ainda ativa.
- Para cada job crítico existe histórico consultável, último sucesso, duração, falha e alerta de falha/atraso; retry não duplica efeito.
- Cálculo de disponibilidade pode ser reproduzido a partir de eventos sintéticos com janela e exclusões documentadas.
- Sem owner/SLO aprovados, relatório marca “meta proposta/não acordada”, não “99,5% cumprido”.

## Fora/decisões

Fora: escolha de fornecedor de monitoramento, custo de infraestrutura, DR multi-região e SLA comercial. Owner decide RPO/RTO, frequência/retention de backup, janela SLO, exclusões, canal/plantão e ambiente. Configuração atual de Railway/worker precisa ser verificada antes de afirmar cobertura.
