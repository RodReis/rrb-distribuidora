# LAC-06 — Plano de implementação

**Objetivo:** análises reproduzíveis de séries próprias do tenant, com origem, cobertura e método explícitos.

**Arquitetura:** motor estatístico puro em `web/src/lib/market/analysis.ts`; API autenticada em `web/src/app/api/market/analyses/[type]/route.ts`; execuções registradas em `analysis_runs`; aba de mercado reutiliza exportação LAC-05. Spread fica indisponível até fórmula landed aprovada.

**Tecnologia:** Next.js 15, React 19, Drizzle/PostgreSQL, Vitest.

## Etapas

- [x] Fixar decisões do PI na SPEC: três ciclos mensais; defasagens 0/1/5/20; apenas séries do tenant; spread indisponível.
- [x] Criar testes determinísticos para amostra sazonal, lacunas, série deslocada e hash.
- [x] Implementar motor e migração `analysis_runs`.
- [x] Criar API com leitura tenant, limite de 10.000 pontos, bloqueio e auditoria de fonte sem licença.
- [x] Criar aba com filtros, cobertura, dispersão, amostra, intervalo de confiança, hash e exportação via LAC-05.
- [x] Fixar calendário de defasagem: segunda a sexta, sem excluir feriados.
- [ ] Executar validação PostgreSQL e smoke autenticado após migração autorizada no banco compartilhado.
- [ ] Revisar diff final, executar CI e entregar PR.
