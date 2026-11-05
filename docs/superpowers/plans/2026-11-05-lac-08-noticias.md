# LAC-08 — Plano de implementação

**Objetivo:** preparar notícias e registros regulatórios com histórico, isolamento por tenant e exibição condicionada a direitos.

**Arquitetura:** persistência versionada e imutável; consultas só expõem metadados autorizados; curadoria manual por administrador. Rotas de revisão e cadastro exigem capabilities próprias.

**Tecnologia:** Next.js, Drizzle, PostgreSQL, Vitest.

## Etapas

- [x] Modelar fontes, versões de notícias, classificações e atos regulatórios; criar migração.
- [x] Testar direitos de exibição e acesso; criar rotas bloqueadas. Constraints de tenant e deduplicação validadas em transação revertida.
- [x] Exibir estado indisponível em `/mercado/noticias`, sem alegar vigência ou classificação não revisada.
- [x] Validar TypeScript, testes, build e revisão de código. Smoke autenticado pendente.
- [x] Após decisões delegadas pelo PI, implementar cadastro manual, revisão, feed e retirada versionada.
- [x] Validar integração PostgreSQL, aplicar migração local e executar smoke autenticado desktop/móvel.

## Decisões pendentes

PI delegou decisões. Fonte deve ter autorização e retenção registradas, exibição só de metadados, revisão por admin, jurisdição explícita, confiança não aplicável para curadoria manual. Coleta automática e alertas seguem fora deste corte.
