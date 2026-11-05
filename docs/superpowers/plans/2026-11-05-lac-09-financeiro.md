# LAC-09 — plano de implementação

**Objetivo:** preparar estrutura financeira sem ativar decisões de produto pendentes.

**Escopo aprovado pelo PI:** estrutura inativa. Fonte, permissões finais, importação, cálculo de crédito, projeção e risco ficam pendentes.

1. Registrar esquema e migração com isolamento por tenant, chaves externas, eventos imutáveis e histórico de importação.
2. Criar autorização explícita, negando papéis não definidos.
3. Expor estado indisponível em API e interface, sem dados financeiros nem indicador de inadimplência.
4. Testar acesso, estado sem dados e integridade da migração. Revisar código e interface.

**Critério de ativação:** PI define fonte, papéis, composição do limite, moeda, projeção e retenção. Nova revisão será necessária para importar ou calcular risco.
