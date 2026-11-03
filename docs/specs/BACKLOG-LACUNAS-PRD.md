# Backlog de specs — lacunas do PRD

**Projeto:** MetalAgents · **Versão:** 1.1 · **Data:** 03/11/2026  
**Status:** specs LAC-01 a LAC-15 detalhadas como propostas de backlog. A LAC-01 foi implementada localmente em 03/11/2026 (não homologada; emissão bloqueada até o PI aprovar a matriz de alçadas) — ver §13 da spec. As demais não autorizam implementação nem alteram o escopo já homologado dos MVPs.

## 1. Objetivo e regra de leitura

Este documento fecha as lacunas entre `PRD.md`, `plano-mvps-metalagents.md` e `specs/MVP-00…04`. Cada pacote abaixo é uma SPEC de backlog a ser detalhada antes de implementação. A ordem proposta organiza dependências; não significa inclusão no MVP atual. Quando o PRD não fornece um valor ou regra, a spec deve exigir decisão/configuração explícita e bloquear comportamento dependente, sem inventar defaults silenciosos.

“Coberto” significa que existe destino documental e critério de especificação; não significa funcionalidade implementada, compromisso de prazo ou aceite do PI.

## 2. Inventário de specs faltantes

| ID | Spec proposta | Conteúdo e lacunas cobertas | Dependências |
|---|---|---|---|
| [LAC-01](./LAC-01-compras-operacionais.md) | Compras operacionais e governança de aprovação | Pedido manual, itens/fornecedor, alçada por valor e papel, estados, aprovação humana, emissão, follow-up, recebimento referenciado ao PC, comparativo/RFQ como etapa separada; preço médio pago alimentado por compras reais; lote mínimo configurável; nenhuma compra emitida sem aprovação válida. **Implementada localmente em 03/11/2026 (não homologada);** faixas de alçada e demais parâmetros de negócio continuam pendentes de aprovação do PI | M0, M2 |
| [LAC-02](./LAC-02-fornecedores-desempenho.md) | Fornecedores e desempenho | Fornecedor preferencial por produto/família, lead time por produto e fornecedor, histórico de entrega, cálculo OTIF com definição de pontualidade/completude e dados ausentes | M0, LAC-01 |
| [LAC-03](./LAC-03-estoque-reservas-depositos.md) | Estoque multi-depósito, reserva e identificação | Reserva por pedido de venda, transferências entre depósitos, matriz/filiais, QR real (geração, impressão, leitura e destino), previsão sazonal e fixture mensurável de ruptura | M2, M3 |
| [LAC-04](./LAC-04-producao-apontamento.md) | Produção e apontamento | Ciclo de ordem de produção, transições incluindo `em_corte`, consumo de lote/retalho, apontamento mobile/offline, perdas e retalhos gerados | M3, LAC-03 |
| [LAC-05](./LAC-05-historico-preco-pago.md) | Relatórios de mercado e preço pago | Exportação CSV/XLSX, cruzamento/alertas de médias com preço pago, proveniência manual/transacional e série de mercado | M1, LAC-01 |
| [LAC-06](./LAC-06-analises-mercado.md) | Análises avançadas de mercado | Sazonalidade, correlações com defasagem, spread importação × nacional, licenças e cobertura | M1, LAC-05 |
| [LAC-07](./LAC-07-sinal-backtesting.md) | Sinal composto e backtesting | Score 0–100, composição, horizonte/confiança, metodologia de backtest, benchmark, custos e proteção contra look-ahead; substituir “82/100” decorativo | M1, M2, LAC-05, LAC-06 |
| [LAC-08](./LAC-08-noticias-regulatorio.md) | Notícias, sentimento e alertas regulatórios | Fonte/licença, ingestão, revisão, evidência, vigência e jurisdição; LLM não determina validade legal | M1, LAC-06 |
| [LAC-09](./LAC-09-financeiro-credito.md) | Financeiro e crédito | Títulos, limite, inadimplência, fluxo, origem/reconciliação e visibilidade do termômetro conforme cobertura real | LAC-01, integração ERP a decidir |
| [LAC-10](./LAC-10-logistica.md) | Logística | Expedição, romaneio, eventos de transporte e rastreio de importação com ETA identificado | LAC-02, LAC-03, LAC-09 |
| [LAC-11](./LAC-11-qualidade-rastreabilidade.md) | Qualidade e rastreabilidade | Certificado preservado, OCR revisado, corrida/heat, não conformidade e bloqueio auditável de lote | M2, LAC-04 |
| [LAC-12](./LAC-12-parametros-comerciais-documentos.md) | Configuração comercial, fiscal e documentos | Margens, parâmetros versionados por UF com fonte/vigência, índices/deltas, dados da distribuidora e proteção de dados sensíveis | M0, M3 |
| [LAC-13](./LAC-13-identidade-permissoes.md) | Segurança de identidade e autorização | MFA, decisão SSO/OAuth2, recuperação, desativação/revogação, modelo de tools do copiloto por papel | M0, M4 |
| [LAC-14](./LAC-14-operacao-sre.md) | SRE, continuidade e operação | 99,5% com janela/owner, healthcheck, homologação, backup/restore, migrations/recuperação e monitoramento dos quatro jobs | Infra M0–M4 |
| [LAC-15](./LAC-15-auditoria-integra-agentes.md) | Auditoria íntegra de agentes e aprovações | Modelo de ameaça, cadeia/checkpoints, trilha de sucesso/falha/negação/cancelamento, minimização, acesso e retenção | M0, M4, LAC-01, LAC-13 |

## 3. Decisões e critérios que precisam constar nas specs

### 3.1 Estoque e ruptura (LAC-03)

O aceite “100% dos SKUs testados” não é mensurável enquanto não houver fixture versionada e denominador. A SPEC deve definir um conjunto fixo de cenários sintéticos com SKU, consumo, lead time, estoque disponível/reservado, histórico, limites e resultado esperado; incluir SKU sem histórico, consumo zero, lead time ausente, saldo negativo e empate de cobertura. Medir `casos elegíveis com alerta correto / casos elegíveis`, reportar também falsos positivos/negativos e publicar o identificador/hash da fixture. O gate de 100% aplica-se somente a esse conjunto fechado, não a todos os SKUs de produção.

Pesos 50/30/20 versus janelas 30/60/90 dias são decisão de negócio. Até aprovação explícita, guardar método e parâmetros versionados, apresentar qual regra está ativa e não afirmar que ambas são equivalentes. Lote mínimo deve ser configurável por produto e fornecedor; nulo significa “sem lote mínimo conhecido” e não autoriza arredondar silenciosamente.

### 3.2 Compras e preços (LAC-01/LAC-05)

Enquanto não existir pedido de compra aprovado, o aceite “nenhuma compra emitida sem aprovação humana” é **não aplicável**, não aprovado por vacuidade. Com a implementação local da LAC-01 (03/11/2026) o aceite passou a ser verificável: a emissão revalida o hash da versão aprovada, a faixa da matriz vigente e as aprovações exigidas, e sem faixa aplicável o pedido fica `aguardando_alcada_configurada`. A SPEC estabeleceu evento verificável de emissão externa/interna, aprovador distinto quando configurado, valor/moeda, versão do conteúdo aprovado, idempotência e bloqueio para edição posterior. Sugestão de compra no M2 continua rotulada como simulação sem efeito e agora tem destino explícito (`/compras/nova` com quantidade estimada); não se apresenta como pedido emitido.

Preço médio pago deve derivar de linhas recebidas/faturadas de compras conforme regra contábil a definir (quantidade, frete/impostos/descontos, devoluções, moeda, unidade e janela). O campo manual existente permanece fonte manual identificada até haver fonte transacional; não misturar os dois sem proveniência.

### 3.3 M3 e produção

Delta de mercado ±20%, desconto de retalho de 65%, mapa família→índice e cobertura de cobre/latão não têm fundamento decisório registrado. Torná-los parâmetros versionados com estado “não configurado”; bloquear o preço dependente ou usar explicitamente o custo-base aprovado, nunca escolher números em código sem aprovação. Margem mínima exige cadastro e escopo de precedência (cliente/produto/família), vigência e papel autorizador. Frete/ICMS por UF exige tabela editável, vigência, fonte e tratamento de UF sem configuração. LAC-04 deve definir quem transforma orçamento em ordem e qual evento efetiva consumo físico.

### 3.4 Requisitos não funcionais e segurança

Disponibilidade 99,5% é meta do PRD sem owner, período, monitor e janela; LAC-14 deve propor medição mensal e exclusões, mas registrar owner como decisão pendente do PI/operador. MFA e SSO/OAuth2 são requisito do PRD; a remoção de SSO no M0 é corte de fase, não dispensa permanente. Decidir identidade/provedor, escopo e fase antes de marcar RNF atendido. Recuperação de senha deve usar token de uso único, expiração e respostas que não revelem existência de conta. Desativação revoga sessões e impede autenticação imediatamente.

Permissões do copiloto são distintas do RBAC de tela: cada tool declara papéis autorizados, tenant e nível de leitura/escrita; negar por padrão. No escopo atual somente leitura. Toda tentativa, inclusive negada, falha e cancelamento, recebe correlação e resultado auditável. “Imutável” requer controles contra alteração por aplicação e operador privilegiado (por exemplo, encadeamento criptográfico e cópia externa com retenção); apenas append-only no ORM não satisfaz o requisito.

## 4. Fora de escopo explicitado, sem apagar do produto

RFQ multi-fornecedor, comparativo automático e conectores de fornecedores ficam posteriores ao pedido manual, conforme Fase 2 do plano. Logística, Financeiro completo, Qualidade/OCR, portal B2B, WhatsApp, nesting real, marketplace e integrações ERP continuam fora do escopo dos MVPs 0–4, mas mantidos no backlog LAC correspondente. Enquanto Financeiro não estiver disponível, o dashboard não pode apresentar termômetro financeiro calculado nem risco de inadimplência como fato: usar “sem dados financeiros”/indisponível e não inferir risco.

Sazonalidade, correlações, spread histórico, sinal 0–100/backtesting, notícias/sentimento e feed regulatório estão no PRD, mas foram postergados/omitidos do plano. LAC-06/07/08 são destino proposto para decisão de roadmap, não inclusão automática na Fase 2.

## 5. Rastreabilidade do PRD para o backlog

| Requisito/lacuna | Destino |
|---|---|
| RF-03 pedido manual, alçada, emissão, follow-up; compra sem aprovação | LAC-01 |
| RFQ e comparativo | LAC-01 (etapa posterior, Fase 2) |
| Preço médio pago real e alertas por médias | LAC-01, LAC-05 |
| Fornecedor padrão, lead time confiável, OTIF | LAC-02 |
| RF-04 reserva geral, depósitos, QR, sazonalidade | LAC-03; LAC-06 |
| Aceite ruptura 100% sem corpus/métrica | LAC-03 §3.1 |
| RF-06 ordem sem transição/consumo e apontamento mobile | LAC-04 |
| CSV/XLSX, spread, sazonalidade, correlação | LAC-05, LAC-06 |
| Sinal 0–100, backtest e mockup 82/100 | LAC-07 |
| Notícias/sentimento e feed regulatório | LAC-08 |
| RF-07, RF-08, risco de inadimplência/termômetro | LAC-09, LAC-10 |
| RF-09 qualidade e rastreabilidade | LAC-11 |
| Margens, limites de preço, UF e cadastro da empresa no PDF | LAC-12 |
| MFA, SSO/OAuth2, senha, desativação e tools por papel | LAC-13 |
| 99,5%, backup/restore, rollback, healthcheck, homologação, jobs | LAC-14 |
| Auditoria realmente resistente a adulteração | LAC-15 |

## 6. Próximo passo de governança

O PI deve aprovar prioridade/fase e resolver as decisões de negócio listadas em cada pacote antes de iniciar implementação. Os documentos LAC detalham contratos propostos, mas não significam aceite de valores, fonte, prioridade, prazo ou promoção para MVP. Atualizar o plano com as decisões aprovadas; não alterar retrospectivamente os aceites dos MVPs já entregues.
