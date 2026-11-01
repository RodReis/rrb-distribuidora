# PRD — MetalAgents: SaaS com Agentes de IA para Distribuidoras de Ferro, Aço e Alumínio

**Versão:** 1.0  
**Data:** 28/10/2026  
**Autor:** Rodrigo Reis (Construtor de Software)  
**Status:** Rascunho para validação  
**Foco central:** **Prevenção** — antecipar ruptura de estoque, alta de preço, perda de margem, sucata excessiva, atraso de fornecedor e risco de crédito antes que aconteçam.

---

## 1. Resumo Executivo

O MetalAgents é uma plataforma SaaS multi-tenant, nativa em IA, para distribuidoras e centros de serviço de ferro, aço e alumínio que vendem material padrão e **cortes/recortes personalizados** (barras, chapas, bobinas, perfis, tubos, slitter, guilhotina, laser, plasma, oxicorte, serra).

A plataforma organiza a empresa em **departamentos operados por agentes de IA** (Compras, Vendas/Orçamentos, Estoque, Produção/Corte, Logística, Financeiro, Qualidade e Diretoria), integrados a:

- **Cotações de commodities em tempo real** (LME, CME/COMEX, SHFE, índices chineses e físicos) e câmbio (PTAX).
- **APIs de fornecedores nacionais e internacionais** (usinas, traders, plataformas B2B).
- **Gráficos de commodities com sinalização de melhor momento para comprar ou vender.**
- **Estoque preventivo**: previsão de demanda, alerta de ruptura, reposição automática sugerida, controle de retalhos e envelhecimento.

A diferença em relação ao mercado: os softwares dos EUA são ótimos em ERP e operação, e os da China são ótimos em dados de preço e marketplace — **nenhum une os dois com agentes preventivos, em português, para a realidade fiscal e cambial brasileira.**

---

## 2. Problema

| Dor da distribuidora | Consequência |
|---|---|
| Comprador consulta preço por telefone, WhatsApp e planilha | Compra no momento errado, perda de 3–10% de margem em ciclos de alta |
| Sem visão de LME/SHFE/índices China + câmbio | Não antecipa repasse de usinas nem oportunidades de importação |
| Estoque controlado por "feeling" | Ruptura de itens de giro + capital parado em itens encalhados |
| Retalhos de corte não rastreados | Sucata vendida a preço de sucata quando poderia atender pedidos |
| Orçamento de corte personalizado manual | Demora de horas, erro de peso/perda, margem inconsistente |
| Certificados de usina (mill certs) em PDF solto | Risco de qualidade e de rastreabilidade de corrida (heat number) |
| Decisões reativas | Empresa "apaga incêndio" em vez de prevenir |

---

## 3. Pesquisa de Mercado — EUA e China

### 3.1 Estados Unidos (ERP + IA operacional)

| Software | O que tem de mais moderno | Fonte |
|---|---|---|
| **INVEX (Invera)** | ERP em nuvem exclusivo para centros de serviço; assistente **Ivy** com Help, Data Insights e **Agents** de vendas e armazém; arquitetura REST, microserviços e **MCP (Model Context Protocol)** para agentes interagirem com o ERP com segurança | [Invera – INVEX AI](https://invera.com/blog/invex-ai-agents-for-the-metal-industry/) |
| **INVEX-MRP** | Planejamento de necessidades com algoritmos de previsão integrados ao ERP em tempo real | [Invera – MRP](https://invera.com/blog/mrp/) |
| **INVEX Workflow** | Motor de regras que transforma eventos do ERP em alertas acionáveis | [Invera – Blog](https://invera.com/blog/category/uncategorized/) |
| **INVEX eCommerce** | Portal self-service: cliente cota, faz pedido, vê estoque e embarque | [Invera](https://invera.com/) |
| **Eniteo + EnVision AI (Enmark)** | BI em linguagem natural; ex.: "estoque com mais de 12 meses e quanto recupero liquidando a custo"; atende 400+ centros de serviço | [Enmark – EnVision AI](https://eniteo.enmark.com/resources/press-media/enmark-announces-envision-ai/) |
| **SSCS (P.S. Data)** | IA que lê pedido de compra do cliente e converte em pedido de venda no ERP, com validação humana | [LineSight – Comparativo ERPs](https://linesight-ai.com/guides/metal-service-center-erp-comparison-2026) |
| **LineSight AI** | "Command Center": lê pedidos de e-mail/PDF/foto, cria pedido, casa bobinas, gera plano de slitting otimizado, cria OP, agenda frete e compra material — humano aprova | [LineSight – Command Center](https://linesight-ai.com/command-center) |
| **GoSmarter** | OCR com IA para certificados de usina, rastreabilidade e planos de corte | [GoSmarter](https://www.gosmarter.ai/blog/metal-service-center-software-erp-for-metal-fabrication-guide/) |
| **Metols (westeel.ai)** | Rastreio por corrida (heat number), alertas de estoque, histórico de preços, cotação com preço por CWT e extras de grau | [Metols](https://westeel.ai/) |
| **Paperless Parts** | Orçamento por IA lendo CAD/PDF, nesting de chapas para custo real de material, preço de metal ao vivo de parceiros | [Paperless Parts](https://www.paperlessparts.com/pricing-costing-automation/) |
| **ChatSKU** | Chat de catálogo que captura pedido de corte sob medida e gera orçamento | [ChatSKU](https://chatsku.com/demos/metals/) |
| **EOXS ERP** | ERP com IA para siderurgia, inclui CRM, BI e e-commerce | [F6S – EOXS](https://www.f6s.com/software/eoxs-erp) |

### 3.2 China (dados de preço + marketplace)

| Plataforma | O que tem de mais moderno | Fonte |
|---|---|---|
| **Mysteel** | Maior agência de preços da China; 200 mil+ preços diários; índices com garantia IOSCO; **Data Feed API** em tempo real; mais de 80% dos contratos de aço na China usam seus índices | [Mysteel – Dados](https://www.mysteel.net/products-services/data-products/), [Mysteel – Sobre](https://www.mysteel.net/about-us/) |
| **Mysteel (IA)** | LLM vertical "Ganglian Master", sistema EBC para compras/vendas/estoque, coleta via satélite e posicionamento de navios | [Baidu Baike – Mysteel](https://baike.baidu.com/en/item/Mysteel/2935717) |
| **SMM (Shanghai Metals Market)** | API com dados do Database Pro, opções, futuros, histórico e notícias | [SMM API](https://www.metal.com/smm-api) |
| **Ouyeel (Baowu)** | Marketplace B2B de aço com logística, armazenagem, processamento e finanças de cadeia; plataforma internacional cross-border | [Ouyeel Intl](https://www.ouyeel.com/intl/), [Multiples – Ouyeel](https://multiples.vc/private-comps/impact-com) |
| **Zhaogang** | Plataforma de negociação de aço B2B | [Multiples](https://multiples.vc/private-comps/zilingo) |

### 3.3 Provedores globais de preço (API)

| Provedor | Cobertura | Fonte |
|---|---|---|
| **Fastmarkets** | Physical Prices API, Market Data API (LME, COMEX, NYMEX, SHFE), Analytics API com **previsões de 24 meses** | [Fastmarkets APIs](https://help.fastmarkets.com/en_US/introduction), [Analytics API](https://help.fastmarkets.com/en_US/apis_sub/fastmarkets-analytics-api) |
| **Argus Metals** | Feeds de LME, CME e SHFE + avaliações físicas via API | [Argus Metals](https://www.argusmedia.com/en/solutions/how-we-deliver/argus-metals) |
| **Metals-API** | 724 símbolos, incluindo LME Aluminium, LME Steel HRC FOB China; atualização de 60 min a 60 s conforme plano; endpoints OHLC e bid/ask | [Metals-API Símbolos](https://metals-api.com/symbols?market=LME), [Documentação](https://api.metals-api.com/documentation) |
| **Banco Central do Brasil – PTAX** | API OData gratuita de câmbio diário (dólar e outras moedas) | [BCB – Dados Abertos](https://dadosabertos.bcb.gov.br/dataset/taxas-de-cambio-todos-os-boletins-diarios/resource/31c63037-2ae9-497a-bcb6-0cc70b1cf77f) |

### 3.4 O que está faltando (lacunas de mercado = nossa oportunidade)

1. **Ninguém une ERP operacional (EUA) + inteligência de preço global (China/LME) + agentes preventivos** em um só produto.
2. **Sinal de compra/venda** de material físico não existe nos ERPs de metal; as agências de preço dão dados, mas não dizem "compre agora 40 t de chapa grossa".
3. **Preço convertido para a realidade BR**: custo de importação desembarcado (FOB China → CIF Santos → impostos → frete até Goiás) comparado com preço da usina nacional, em tempo real.
4. **Estoque preventivo com retalhos**: os ERPs americanos tratam retalho, mas não fazem matching automático de retalho com pedidos futuros previstos.
5. **Agentes em português via WhatsApp** (o canal real de compra e venda no Brasil).
6. **Fiscal brasileiro nativo** (NF-e, SPED, ICMS-ST, DIFAL) com agentes, algo que soluções estrangeiras não atendem.
7. **Precificação dinâmica preventiva**: ajustar tabela de venda antes do repasse da usina chegar.
8. **Preço acessível para PME** (distribuidoras médias e pequenas do interior), enquanto ERPs americanos miram centros de serviço grandes.

---

## 4. Visão do Produto e Objetivos

**Visão:** "A distribuidora que enxerga o mercado antes dele mudar."

| Objetivo | Métrica (KPI) | Meta 12 meses |
|---|---|---|
| Reduzir ruptura de estoque | % de pedidos perdidos por falta | -50% |
| Reduzir capital parado | Dias de estoque (DIO) | -20% |
| Melhorar timing de compra | Preço médio pago vs. média móvel 90d | 2–5% abaixo |
| Aproveitar retalhos | % de retalho reaproveitado | +30% |
| Agilizar orçamento de corte | Tempo médio de orçamento | < 3 minutos |
| Proteger margem | Margem bruta média | +1,5 p.p. |
| Prevenir inadimplência | Atraso > 30 dias | -25% |

---

## 5. Personas

| Persona | Necessidade |
|---|---|
| **Dono/Diretor** | Painel de risco e oportunidades, decisão de compra grande, margem |
| **Comprador** | Melhor preço, melhor momento, fornecedor confiável, prazo |
| **Vendedor interno** | Orçamento rápido de corte, preço correto, disponibilidade real |
| **Almoxarife/Estoque** | Saber o que repor, onde está, retalhos disponíveis |
| **Programador de corte** | Plano de corte otimizado, mínima perda |
| **Financeiro** | Fluxo de caixa, crédito do cliente, câmbio |
| **Qualidade** | Certificados de usina, rastreio por corrida |
| **Cliente final (B2B)** | Portal/WhatsApp para cotar e pedir corte sob medida |

---

## 6. Arquitetura de Agentes por Departamento

Cada agente possui: objetivo, ferramentas (tools), gatilhos, limites de autonomia e **política de aprovação humana** (human-in-the-loop) para decisões que envolvem dinheiro.

### 6.1 Agente de Inteligência de Mercado (Market Agent) — núcleo preventivo

- Coleta contínua de preços: LME (alumínio, cobre, níquel, zinco), CME (HRC Midwest, sucata), SHFE (vergalhão, bobina a quente, alumínio), índices Mysteel/SMM, preços FOB China de exportação, câmbio PTAX e futuros de dólar.
- Normaliza unidades (US$/t, R$/kg, yuan/t, CWT) e moedas.
- Calcula **custo desembarcado de importação** vs. **preço usina nacional**.
- Lê notícias (antidumping, cotas, tarifas, paradas de usina, greves, frete marítimo) e classifica impacto (NLP/sentimento).
- Gera **sinal de compra/venda** (ver seção 8).
- **Preventivo:** alerta "alta provável de 6–9% nas próximas 3–6 semanas para laminados planos — antecipar compra de X t".

### 6.2 Agente de Compras (Procurement Agent)

- Consulta APIs de fornecedores, portais B2B e, onde não há API, envia **RFQ automático** por e-mail/WhatsApp e lê as respostas (LLM extrai preço, prazo, condição).
- Monta **quadro comparativo** (preço, prazo, histórico de entrega, qualidade, frete, impostos).
- Sugere pedido de compra combinando: necessidade de estoque + sinal de mercado + caixa disponível.
- Score de fornecedor (OTIF, não conformidades, variação de preço).
- **Preventivo:** detecta atraso provável de fornecedor (histórico + notícias) e aciona fornecedor alternativo antes da ruptura.

### 6.3 Agente de Estoque Preventivo (Inventory Agent)

- Previsão de demanda por SKU/bitola/espessura/liga (sazonalidade, obras, carteira de pedidos, clima, indicadores de construção).
- Cálculo dinâmico de **estoque de segurança, ponto de pedido e lote econômico**.
- Curva ABC/XYZ automática.
- **Gestão de retalhos**: cada sobra de corte vira SKU com dimensões, liga e corrida; matching automático com pedidos abertos e previstos.
- Alertas de: ruptura prevista (dias de cobertura < lead time), excesso, envelhecimento (> 180/365 dias), divergência de inventário, oxidação/armazenagem inadequada.
- Inventário cíclico guiado por risco (contar primeiro o que tem mais chance de divergir).
- **Preventivo:** "Em 12 dias você vai faltar chapa 1/4 A36; lead time do fornecedor é 15 dias — compre hoje."

### 6.4 Agente de Vendas e Orçamentos (Sales/Quote Agent)

- Recebe pedido por **WhatsApp, e-mail, PDF, foto, portal ou voz**; extrai itens, medidas, quantidades.
- Calcula peso teórico (densidade por liga), perda de corte, custo de processo (laser/plasma/guilhotina/serra/dobra), frete e impostos.
- Aplica **precificação dinâmica** com base no custo de reposição (não no custo histórico).
- Gera proposta PDF com validade ligada à volatilidade do mercado.
- Sugere upsell/cross-sell e reativação de clientes inativos.
- **Preventivo:** reduz validade da proposta quando o Market Agent detecta tendência de alta; alerta vendedor quando o preço está abaixo do custo de reposição.

### 6.5 Agente de Produção e Corte (Cutting Agent)

- **Nesting** de chapas (laser/plasma/oxicorte) e **otimização de corte linear** de barras/tubos/perfis (problema de cutting stock) e slitting de bobinas.
- Prioriza uso de retalhos antes de material novo.
- Sequenciamento de máquinas, setup e prazos.
- Manutenção preditiva das máquinas (horas, consumíveis, vibração/sensores IoT opcionais).
- **Preventivo:** alerta de gargalo de máquina dias antes; prevê troca de consumível antes da falha.

### 6.6 Agente de Logística (Logistics Agent)

- Roteirização, montagem de carga por peso/volume, cotação de frete.
- Rastreio de importações (navio, porto, desembaraço).
- **Preventivo:** alerta de atraso de navio/porto e impacto no estoque.

### 6.7 Agente Financeiro (Finance Agent)

- Fluxo de caixa projetado com compras sugeridas.
- Análise de crédito do cliente (histórico + bureaus).
- Exposição cambial em importações; sugestão de hedge simples.
- **Preventivo:** bloqueio preventivo de crédito, alerta de caixa negativo futuro.

### 6.8 Agente de Qualidade (Quality Agent)

- OCR/IA de **certificados de usina**: composição química, propriedades mecânicas, norma (ASTM, ABNT, SAE).
- Rastreabilidade por corrida (heat number) do recebimento ao corte e entrega.
- **Preventivo:** bloqueia lote fora da norma antes de ir para produção.

### 6.9 Agente Diretor (Orquestrador / CEO Copilot)

- Coordena os demais agentes; resolve conflitos (ex.: Compras quer comprar, Financeiro diz que falta caixa).
- Briefing diário às 7h (WhatsApp/e-mail): riscos, oportunidades, decisões pendentes.
- Perguntas em linguagem natural: "Qual margem perdi por vender abaixo do custo de reposição no último mês?"

---

## 7. Módulo de Preços e Integração com Fornecedores

### 7.1 Fontes de dados

| Categoria | Fonte | Tipo | Frequência |
|---|---|---|---|
| Bolsas | LME, CME/COMEX, SHFE | API (Fastmarkets / Argus / Metals-API) | Intradiário a diário |
| Índices China | Mysteel, SMM | API paga | Diário |
| Físico global | Fastmarkets, Argus | API paga | Diário/semanal |
| Câmbio | BCB PTAX | API gratuita | Diário |
| Fornecedores nacionais | Usinas, distribuidores, traders | API quando houver; senão RFQ por e-mail/WhatsApp lido por IA; portais via automação de navegador | Sob demanda |
| Fornecedores internacionais | Ouyeel, traders, usinas Ásia/Turquia/Índia | API/portal/e-mail | Sob demanda |
| Interno | Histórico de compras e vendas do cliente | Banco próprio | Tempo real |

### 7.2 Camada de integração

- **Conectores plugáveis** (padrão adapter) por fornecedor; cada um declara: autenticação, endpoints, mapeamento de produto, limite de requisições.
- **Catálogo unificado de produtos** (de-para): norma, liga, bitola, espessura, largura, comprimento, acabamento.
- **Motor de normalização**: moeda, unidade, Incoterm (FOB/CFR/CIF), impostos (II, IPI, PIS/COFINS, ICMS), frete marítimo e rodoviário.
- **Cálculo de paridade de importação** em tempo real.
- Caso a API não exista: agentes de navegador e leitura de e-mail com aprovação humana.
- Observação contratual: dados de Mysteel, Fastmarkets e Argus exigem licença; o produto deve respeitar termos de redistribuição (exibir apenas a clientes licenciados ou derivar indicadores próprios).

---

## 8. Gráficos de Commodities e Sinal de Compra/Venda

### 8.1 Gráficos

- Candlestick (OHLC), linha, comparação multiativo (ex.: LME Alumínio x PTAX x preço pago).
- Overlay do **preço médio que a empresa pagou** sobre o gráfico de mercado.
- Spread importação x nacional.
- Sazonalidade histórica (média por mês dos últimos 5–10 anos).
- Correlações (minério de ferro → HRC; alumínio LME → perfil nacional com defasagem de N semanas).
- Biblioteca sugerida: TradingView Lightweight Charts / Apache ECharts.

### 8.2 Motor de sinais (Buy/Sell Signal Engine)

Sinal composto (0–100) combinando:

| Componente | Exemplo de técnica | Peso inicial |
|---|---|---|
| Tendência | Médias móveis 20/50/200, MACD | 20% |
| Momento | RSI, desvio da média (z-score) | 15% |
| Previsão estatística/ML | Prophet, ARIMA/SARIMA, LightGBM, modelos de séries temporais (Temporal Fusion Transformer / Chronos) | 25% |
| Fundamentos | Estoques em bolsa (LME/SHFE), utilização de capacidade chinesa, PMI | 15% |
| Notícias/sentimento | LLM classificando impacto de notícias | 10% |
| Câmbio | Tendência PTAX e futuros | 10% |
| Necessidade interna | Cobertura de estoque vs. lead time | 5% |

**Saída para o usuário:**

- **Verde — Comprar/antecipar** (score > 70)
- **Amarelo — Neutro/comprar só o necessário** (40–70)
- **Vermelho — Adiar compra / vender estoque excedente** (< 40)
- Explicação em linguagem natural ("Por que este sinal?") + nível de confiança + horizonte.
- **Backtesting** contínuo: mostrar quanto o sinal teria economizado no histórico.
- Aviso obrigatório: sinal é apoio à decisão, não recomendação financeira; decisão final é humana.

### 8.3 Sinal de venda

- Quando o mercado está em alta e há excesso de estoque: sugerir campanha comercial, subir tabela, ou vender lote parado.
- Quando o mercado está em queda: acelerar giro de estoque caro antes da desvalorização.

---

## 9. Prevenção — Matriz de Riscos Monitorados

| Risco | Sinal antecipado | Agente | Ação preventiva automática |
|---|---|---|---|
| Ruptura de estoque | Cobertura < lead time + margem | Estoque | Sugere PC; avisa vendas para não prometer prazo |
| Alta de preço | Score de mercado + notícias + repasse de usina | Mercado | Antecipar compra; encurtar validade de propostas |
| Queda de preço | Tendência negativa | Mercado | Reduzir compra; vender estoque caro primeiro |
| Venda abaixo do custo de reposição | Preço proposto < custo reposição | Vendas | Bloqueio com aprovação gerencial |
| Atraso de fornecedor | OTIF histórico, notícias, rastreio | Compras/Logística | Fornecedor alternativo |
| Estoque envelhecido | Idade > limite | Estoque | Campanha, liquidação, uso em corte |
| Sucata excessiva | % perda por máquina/operador | Corte | Revisar nesting; treinamento |
| Falha de máquina | Horas, consumíveis, sensores | Corte | OS preventiva |
| Lote fora de norma | Certificado divergente | Qualidade | Bloqueio do lote |
| Inadimplência | Atrasos, mudança de comportamento | Financeiro | Reduz limite, pede antecipação |
| Caixa negativo futuro | Fluxo projetado | Financeiro | Reprograma compras |
| Risco cambial | Volatilidade PTAX | Financeiro/Mercado | Sugere fechamento de câmbio/hedge |
| Mudança regulatória/tarifa | Notícias (antidumping, cotas) | Mercado | Alerta à diretoria |
| Divergência de inventário | Padrões de ajuste | Estoque | Contagem cíclica dirigida |

---

## 10. Requisitos Funcionais (por módulo)

### RF-01 Cadastros

- Produtos metálicos com atributos técnicos (norma, liga, têmpera, bitola, espessura, largura, comprimento, peso/m, densidade).
- Fornecedores, clientes, máquinas, armazéns/endereçamento, tabelas de preço.

### RF-02 Mercado e Preços

- Painel em tempo real; alertas configuráveis (preço, variação %, cruzamento de médias).
- Paridade de importação; histórico ilimitado; exportação CSV/Excel.

### RF-03 Compras

- RFQ automático multi-fornecedor; comparativo; aprovação por alçada; pedido de compra; follow-up automático.

### RF-04 Estoque

- Previsão de demanda; reposição sugerida; retalhos com etiqueta QR; inventário cíclico; múltiplos depósitos; reserva para pedidos.

### RF-05 Vendas

- Orçamento por WhatsApp/e-mail/PDF/foto; cálculo de peso e corte; proposta PDF; funil de vendas; portal B2B.

### RF-06 Produção/Corte

- Nesting 2D; corte linear 1D; slitting; ordens de produção; apontamento mobile; uso prioritário de retalhos.

### RF-07 Logística

- Romaneio, carga, roteiro, rastreio de importação.

### RF-08 Financeiro e Fiscal (Brasil)

- Integração com NF-e/NFS-e, SPED, ICMS-ST/DIFAL (via ERP existente ou módulo próprio), contas a pagar/receber, crédito.

### RF-09 Qualidade

- Leitura de certificados por IA; rastreio por corrida; não conformidades.

### RF-10 Copiloto e Relatórios

- Perguntas em linguagem natural; briefing diário; dashboards por departamento.

### RF-11 Integrações

- Conectores com ERPs brasileiros comuns (via API/banco), WhatsApp Business API, e-mail, planilhas, máquinas CNC (exportação de programas/nests).

---

## 11. Requisitos Não Funcionais

| Item | Requisito |
|---|---|
| Disponibilidade | 99,5% (MVP) → 99,9% |
| Latência | Painel de preços < 2 s; orçamento < 30 s |
| Segurança | SSO/OAuth2, MFA, RBAC por departamento, criptografia em trânsito e repouso, auditoria de todas as ações de agentes |
| Privacidade | Conformidade LGPD; isolamento de dados por tenant |
| Governança de IA | Log de raciocínio/ação de cada agente; aprovação humana para compras, preços e créditos acima de alçada; limites de gasto por agente |
| Escalabilidade | Multi-tenant; filas e workers horizontais |
| Mobile | PWA para chão de fábrica e vendedores |
| Idioma | Português (BR) nativo; inglês/espanhol depois |
| Offline | Apontamento de produção com sincronização posterior |

---

## 12. Tecnologia Moderna Proposta

### 12.1 Arquitetura geral

```text
[Canais: Web | PWA | WhatsApp | E-mail | Portal B2B]
                 │
          [API Gateway / BFF]
                 │
   ┌─────────────┴───────────────────────────┐
[Orquestrador de Agentes]   [Serviços de domínio]
 (LangGraph / OpenAI Agents  Estoque, Compras, Vendas,
  SDK / CrewAI + MCP)        Corte, Financeiro, Qualidade
   │                               │
[Tools via MCP] ─────────── [Event Bus: Kafka/Redpanda ou NATS]
   │                               │
[LLMs: Claude / GPT / Gemini   [Pipelines de dados de mercado]
 + modelos locais p/ custo]     (Airflow/Dagster/Temporal)
   │                               │
[Vector DB: pgvector/Qdrant]  [TimescaleDB/ClickHouse - séries]
                 │
          [PostgreSQL multi-tenant]
```

### 12.2 Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js + React + TypeScript, Tailwind, shadcn/ui; gráficos com TradingView Lightweight Charts e ECharts |
| Mobile | PWA (e futuramente React Native) |
| Backend | Node.js (NestJS) ou Python (FastAPI) para serviços de IA/otimização |
| Agentes | LangGraph ou OpenAI Agents SDK; protocolo **MCP** para expor ferramentas do ERP aos agentes (mesma abordagem adotada pela [Invera](https://invera.com/blog/invex-ai-agents-for-the-metal-industry/)) |
| LLMs | Modelos de fronteira (Claude, GPT, Gemini) via roteador; modelos menores para tarefas de extração e custo baixo |
| Workflows duráveis | Temporal (aprovações, RFQs longos, retries) |
| Dados de séries | TimescaleDB ou ClickHouse |
| Banco principal | PostgreSQL com Row-Level Security por tenant |
| Busca semântica | pgvector / Qdrant (catálogo, certificados, contratos) |
| Mensageria | Kafka/Redpanda ou NATS |
| ML de previsão | Python: statsforecast, Prophet, LightGBM, modelos fundacionais de séries temporais |
| Otimização de corte | Google OR-Tools (cutting stock, bin packing), bibliotecas de nesting 2D (ex.: algoritmos tipo SVGnest/no-fit polygon) |
| OCR/Documentos | LLM multimodal + OCR para PDFs, fotos e certificados |
| WhatsApp | Decidir sobre qual usar |
| Observabilidade | OpenTelemetry, Grafana, Sentry; avaliação de agentes (LangSmith/Langfuse) |
| Infra | Kubernetes ou serviços gerenciados (AWS/GCP), Terraform, CI/CD GitHub Actions |
| Segurança | Keycloak/Auth0, Vault para segredos, WAF |

---

## 13. Modelo de Dados (entidades principais)

- `tenant`, `usuario`, `papel`
- `produto` (norma, liga, forma, dimensões, densidade)
- `lote` (corrida/heat, certificado, fornecedor, custo, localização)
- `retalho` (lote origem, dimensões, peso, status)
- `movimento_estoque`
- `fornecedor`, `conector_fornecedor`, `cotacao_fornecedor`
- `serie_preco_mercado` (fonte, símbolo, timestamp, OHLC, moeda, unidade)
- `sinal_mercado` (produto/família, score, componentes, explicação, horizonte)
- `previsao_demanda` (sku, período, valor, intervalo de confiança)
- `pedido_compra`, `pedido_venda`, `orcamento`, `item_corte`
- `plano_corte` (nesting, aproveitamento %, retalhos gerados)
- `maquina`, `ordem_producao`, `manutencao`
- `cliente`, `limite_credito`, `titulo_financeiro`
- `acao_agente` (agente, entrada, ferramentas usadas, saída, aprovador, status) — trilha de auditoria

---

## 14. Fluxos-Chave (exemplos)

### 14.1 Compra preventiva

1. Inventory Agent detecta cobertura de 10 dias para chapa 3/16 A36 (lead time 14 dias).
2. Market Agent informa score 78 (tendência de alta + repasse de usina anunciado).
3. Procurement Agent envia RFQ para 5 fornecedores, recebe 4 respostas, monta comparativo com custo desembarcado.
4. Finance Agent confirma caixa.
5. Diretor recebe no WhatsApp: "Sugiro comprar 60 t (necessidade 35 t + antecipação 25 t) do fornecedor B a R$ X/kg. Economia estimada R$ Y. Aprovar?"
6. Aprovado → PC emitido → follow-up automático.

### 14.2 Orçamento de corte via WhatsApp

1. Cliente envia foto de croqui: "10 peças 300x500 chapa 1/4".
2. Sales Agent extrai, calcula peso, consulta retalhos disponíveis, roda nesting, aplica preço de reposição + processo + frete.
3. Proposta em PDF em menos de 3 minutos; validade de 2 dias porque o mercado está volátil.

### 14.3 Bloqueio preventivo de qualidade

1. Lote chega com certificado; Quality Agent lê e detecta limite de escoamento abaixo da norma.
2. Lote bloqueado, fornecedor notificado, Compras avisado para reposição.

---

## 15. Roadmap

| Fase | Prazo | Entregas |
|---|---|---|
| **MVP (Fase 1)** | 0–4 meses | Painel de commodities (LME/CME via Metals-API + PTAX), alertas, estoque preventivo básico (ponto de pedido dinâmico, ruptura, envelhecimento), orçamento de corte com peso/perda, copiloto em linguagem natural, integração com ERP via planilha/API |
| **Fase 2** | 4–8 meses | Sinal de compra/venda com backtesting, RFQ automático por e-mail/WhatsApp, comparativo de fornecedores, paridade de importação, retalhos com QR, nesting 2D e corte linear |
| **Fase 3** | 8–12 meses | Orquestrador multiagente completo, agentes de Financeiro e Qualidade (OCR de certificados), portal B2B, índices chineses (Mysteel/SMM) e físicos (Fastmarkets/Argus) licenciados |
| **Fase 4** | 12–18 meses | Marketplace de retalhos/excedentes entre distribuidoras, manutenção preditiva com IoT, hedge cambial assistido, expansão LatAm |

---

## 16. Modelo de Negócio (sugestão inicial)

| Plano | Público | Inclui |
|---|---|---|
| **Essencial** | Distribuidora pequena | Painel de preços, estoque preventivo, orçamento de corte |
| **Profissional** | Distribuidora média | + agentes de Compras/Vendas, sinais, WhatsApp, nesting |
| **Enterprise** | Centro de serviço / rede | + todos os agentes, dados premium licenciados, SLA, integrações customizadas |

Cobrança por empresa + usuários + consumo de agentes; dados premium (Mysteel/Fastmarkets/Argus) como add-on repassado.

---

## 17. Riscos do Projeto e Mitigações

| Risco | Mitigação |
|---|---|
| Custo de licenças de dados premium | Começar com Metals-API + PTAX; premium como add-on |
| Fornecedores BR sem API | RFQ por e-mail/WhatsApp lido por IA; automação de portais |
| Alucinação de IA em preço | Cálculos determinísticos em código; LLM só interpreta e explica; validação humana |
| Sinal errado gera prejuízo | Backtesting público, intervalo de confiança, limite de antecipação, decisão humana |
| Resistência cultural | Briefing por WhatsApp, onboarding guiado, ROI visível em 30 dias |
| Integração com ERP legado | Conectores por banco/API/arquivo; começar como camada "ao lado" do ERP (como faz a [LineSight](https://linesight-ai.com/compare/linesight-vs-ps-data)) |
| LGPD e segurança | RLS por tenant, criptografia, auditoria |

---

## 18. Critérios de Aceite do MVP

- [ ] Painel mostra LME Alumínio, HRC e PTAX atualizados, com gráfico e histórico de 2+ anos.
- [ ] Alerta de ruptura dispara quando cobertura < lead time em 100% dos SKUs testados.
- [ ] Orçamento de corte com peso calculado com erro < 1% vs. tabela técnica.
- [ ] Copiloto responde 20 perguntas de negócio de teste com precisão > 90%.
- [ ] Toda ação de agente registrada em trilha de auditoria.
- [ ] Nenhuma compra emitida sem aprovação humana.

---

## 19. Diferenciais Competitivos (resumo)

1. **Prevenção como produto**: o sistema avisa antes do problema.
2. **Mercado global + operação local** em uma única tela.
3. **Sinal de compra/venda explicável** com backtesting.
4. **Retalho como ativo**, não como sucata.
5. **WhatsApp-first e português nativo.**
6. **Fiscal e câmbio brasileiros embutidos.**
7. **Arquitetura de agentes com MCP**, pronta para novos agentes e LLMs.

---

## 20. Fontes Consultadas

- Invera – INVEX AI e Ivy Agents: https://invera.com/blog/invex-ai-agents-for-the-metal-industry/
- Invera – INVEX: https://invera.com/
- Invera – INVEX-MRP: https://invera.com/blog/mrp/
- Invera – INVEX Workflow: https://invera.com/blog/category/uncategorized/
- Enmark – EnVision AI: https://eniteo.enmark.com/resources/press-media/enmark-announces-envision-ai/
- LineSight – Comparativo de ERPs 2026: https://linesight-ai.com/guides/metal-service-center-erp-comparison-2026
- LineSight – Command Center: https://linesight-ai.com/command-center
- LineSight vs PS Data: https://linesight-ai.com/compare/linesight-vs-ps-data
- GoSmarter: https://www.gosmarter.ai/blog/metal-service-center-software-erp-for-metal-fabrication-guide/
- Metols: https://westeel.ai/
- Paperless Parts: https://www.paperlessparts.com/pricing-costing-automation/
- ChatSKU: https://chatsku.com/demos/metals/
- EOXS ERP: https://www.f6s.com/software/eoxs-erp
- Mysteel – Produtos de dados: https://www.mysteel.net/products-services/data-products/
- Mysteel – Sobre: https://www.mysteel.net/about-us/
- Mysteel – Baidu Baike: https://baike.baidu.com/en/item/Mysteel/2935717
- SMM API: https://www.metal.com/smm-api
- Ouyeel Internacional: https://www.ouyeel.com/intl/
- Multiples – Ouyeel/Zhaogang: https://multiples.vc/private-comps/impact-com
- Fastmarkets APIs: https://help.fastmarkets.com/en_US/introduction
- Fastmarkets Analytics API: https://help.fastmarkets.com/en_US/apis_sub/fastmarkets-analytics-api
- Argus Metals: https://www.argusmedia.com/en/solutions/how-we-deliver/argus-metals
- Metals-API – Símbolos LME: https://metals-api.com/symbols?market=LME
- Metals-API – Documentação: https://api.metals-api.com/documentation
- Banco Central do Brasil – API PTAX: https://dadosabertos.bcb.gov.br/dataset/taxas-de-cambio-todos-os-boletins-diarios/resource/31c63037-2ae9-497a-bcb6-0cc70b1cf77f