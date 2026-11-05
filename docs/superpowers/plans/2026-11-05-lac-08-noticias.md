# LAC-08 — Plano de implementação

**Objetivo:** preparar notícias e registros regulatórios com histórico, isolamento por tenant e exibição condicionada a direitos.

**Arquitetura:** persistência versionada e imutável; consultas só expõem metadados autorizados; feed e ingestão ficam desligados até decisões do PI. Rotas de revisão e cadastro exigem capabilities próprias.

**Tecnologia:** Next.js, Drizzle, PostgreSQL, Vitest.

## Etapas

- [x] Modelar fontes, versões de notícias, classificações e atos regulatórios; criar migração.
- [x] Testar direitos de exibição e acesso; criar rotas bloqueadas. Constraints de tenant e deduplicação validadas em transação revertida.
- [x] Exibir estado indisponível em `/mercado/noticias`, sem alegar vigência ou classificação não revisada.
- [x] Validar TypeScript, testes, build e revisão de código. Smoke autenticado pendente.
- [ ] Após decisões do PI, implementar ingestão, classificação, revisão, feed e alertas; aplicar migração e validar integração.

## Decisões pendentes

Fontes e licenças, jurisdições, revisores, limiar de confiança, correção e retirada. Sem essas decisões, ingestão e feed seguem desligados.
