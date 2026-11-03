# MetalAgents — aplicação web

Aplicação Next.js do **MetalAgents**, o SaaS de inteligência preventiva para distribuidoras de ferro, aço e alumínio
da RRB Distribuidora. Este pacote contém a interface, as rotas de API, o motor preditivo de estoque, o motor
metalúrgico de orçamento e os jobs de mercado.

> Documentação de produto, decisões e débitos ficam em [`../docs/`](../docs/README.md).
> Regras de frontend (tokens, componentes, CRUD completo) são obrigatórias: [`../docs/regras-frontend.md`](../docs/regras-frontend.md).

## Stack

| Camada       | Tecnologia                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Framework    | Next.js **15.5.28** (App Router, React Server Components)                                                  |
| UI           | React **19**, Tailwind com os tokens do design system (tema escuro carbon), Inter + JetBrains Mono, sonner |
| Banco        | PostgreSQL 16 + Drizzle ORM 0.45 (`drizzle-kit` para migrations)                                           |
| Autenticação | Auth.js (**next-auth 5 beta**) com credenciais, Argon2id e RBAC por módulo                                 |
| PDF          | `@react-pdf/renderer` no servidor                                                                          |
| Storage      | Cloudflare R2 (S3-compatible) com fallback local em `.data/quotes`                                         |
| Testes       | Vitest (unitários + integração com Postgres opt-in via `RUN_DB_TESTS=1`)                                   |
| Runtime      | Node **24** · pnpm **10.33**                                                                               |

## Módulos implementados

| MVP                              | Escopo                                                                                              | Rotas principais                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 — Fundação**                | Login multi-tenant, RBAC, shell, cadastros, importação CSV                                          | `/login`, `/produtos`, `/clientes`, `/fornecedores`, `/maquinas`, `/depositos`, `/importar`, `/configuracoes`, `/admin/usuarios`, `/admin/auditoria` |
| **M1 — Inteligência de Mercado** | Cotações LME/HRC/PTAX, séries, alertas, paridade de importação                                      | `/mercado`, `/mercado/arbitragem`, `/api/market/*`, `/api/internal/jobs/*`                                                                           |
| **M2 — Estoque Preventivo**      | Lotes, movimentos, previsão de demanda, matriz de ruptura, retalhos                                 | `/estoque`, `/estoque/lotes`, `/estoque/retalhos`, `/api/stock/*`                                                                                    |
| **M3 — Orçamentos**              | Motor de peso/custo, precificação preventiva, funil, PDF, pedido de venda                           | `/vendas/orcamentos`, `/vendas/orcamentos/novo`, `/vendas/orcamentos/[id]`, `/api/quotes/*`                                                          |
| **LAC-01 — Compras**             | Pedido de compra, alçada versionada, aprovação, emissão idempotente, follow-up, recebimento/estorno | `/compras`, `/compras/nova`, `/compras/[id]`, `/configuracoes?tab=compras`, `/api/purchases/*`                                                       |

O M4 (copiloto com tool-calling) está implementado parcialmente: briefing 07h, Command Center,
trilha de auditoria, termos de uso com aceite e provedores de IA por tenant; ainda sem homologação.
O LAC-01 (compras) está implementado localmente e não homologado — a emissão fica bloqueada até o
PI configurar a matriz de alçadas em _Configuração › Compras_.

## Pré-requisitos

- **Node.js 24** (mesma versão do CI e da produção)
- **pnpm 10.33** (`corepack enable` já resolve a versão declarada em `package.json`)
- **Docker** — o Postgres de desenvolvimento roda no container `metalagents-postgres` (porta **54320**)

## Instalação

```powershell
# 1. Dependências
cd web
pnpm install

# 2. Banco de desenvolvimento (na raiz do repositório)
cd ..
docker compose up -d          # sobe metalagents-postgres em 127.0.0.1:54320

# 3. Variáveis de ambiente
cd web
Copy-Item .env.example .env
# ajuste DATABASE_URL para a porta 54320 (o exemplo aponta para 5432):
# postgresql://metalagents:metalagents_secret@127.0.0.1:54320/metalagents

# 4. Schema
pnpm db:migrate

# 5. Dados de desenvolvimento (tenant, usuários, permissões)
pnpm db:seed

# 6. Dados de demonstração dos MVPs 1 e 2 (opcional, só em desenvolvimento)
pnpm db:seed-market
pnpm db:seed-stock

# 7. Aplicação
pnpm dev                      # http://localhost:3000
```

Atalho útil: o Postgres local já parou sozinho algumas vezes; se aparecer `ECONNREFUSED` na porta 54320,
rode `docker compose start`.

## Acesso de desenvolvimento

O `pnpm db:seed` (sem `SEED_MODE=production`) cria cinco usuários com a senha **`Admin@123456`**:

| E-mail                               | Papel     | Permissões                                                                                                                     |
| ------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `vendas@gfdistribuicao.com.br`       | vendedor  | escrita em **orçamentos** e no cadastro de clientes (criar, editar rascunho, gerar PDF, converter em pedido); leitura no resto |
| `diretoria@gfdistribuicao.com.br`    | diretor   | leitura em todos os módulos + **liberação de margem** de orçamento bloqueado (alçada exclusiva)                                |
| `rodrigo.reis@gfdistribuicao.com.br` | admin     | escrita em todos os módulos, inclusive `/admin/*`                                                                              |
| `compras@gfdistribuicao.com.br`      | comprador | escrita em compras/RFQ, inteligência de mercado e fornecedores; leitura em vendas                                              |
| `operador@gfdistribuicao.com.br`     | estoque   | escrita em estoque/retalhos, produtos, depósitos e máquinas; leitura em vendas                                                 |

> ⚠️ **Somente desenvolvimento.** O seed de produção (`SEED_MODE=production SEED_ADMIN_PASSWORD=…`) cria
> apenas o admin `rodrigo.reis@gfdistribuicao.com.br`, com senha definida no comando — nunca use `Admin@123456`
> em produção. A senha do admin de produção **não** está documentada (débito A4 em
> [`../docs/debitos-tecnicos.md`](../docs/debitos-tecnicos.md)).

## Variáveis de ambiente

Referência completa: [`../docs/deploy.md`](../docs/deploy.md) §4.

| Variável                                                                 | Obrigatória | Uso                                                                                                             |
| ------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                           | sim         | Postgres (porta **54320** no Docker local; host interno no Railway)                                             |
| `AUTH_SECRET`                                                            | sim         | Assinatura do JWT de sessão (≥ 32 caracteres)                                                                   |
| `NEXTAUTH_URL`                                                           | sim         | URL pública da aplicação; precisa do `https://` em produção                                                     |
| `RESEND_API_KEY`                                                         | não         | Convites e alertas por e-mail; sem ela a senha temporária aparece na tela                                       |
| `CRON_SECRET`                                                            | não         | Protege `/api/internal/jobs/*` (worker de mercado)                                                              |
| `METALS_API_KEY`                                                         | não         | Provedor de cotações; sem chave, em dev usa fixture sintética                                                   |
| `COMMODITY_PRICE_API_KEY`                                                | não         | Provedor CommodityPriceAPI (cabeçalho `x-api-key`); cada mercado escolhe o provedor em _Configuração › Mercado_ |
| `APP_INTERNAL_URL`                                                       | não         | URL que o worker usa para chamar o app                                                                          |
| `METALS_CRON`                                                            | não         | Cron de coleta de metais (padrão `0 19 * * 1-5`, fuso São Paulo)                                                |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | não         | PDF no Cloudflare R2. **As quatro em conjunto**; faltando qualquer uma, grava em `.data/quotes`                 |
| `R2_PUBLIC_BASE_URL`                                                     | não         | Se definida, o PDF é servido por URL pública                                                                    |

## Scripts

| Comando                             | O que faz                                                 |
| ----------------------------------- | --------------------------------------------------------- |
| `pnpm dev`                          | servidor de desenvolvimento em `http://localhost:3000`    |
| `pnpm build` / `pnpm start`         | build e execução de produção                              |
| `pnpm lint`                         | ESLint                                                    |
| `pnpm format` / `pnpm format:check` | Prettier (o CI exige `format:check` verde)                |
| `pnpm test`                         | Vitest (suíte completa)                                   |
| `pnpm db:generate`                  | gera migration a partir do schema Drizzle                 |
| `pnpm db:migrate`                   | aplica as migrations pendentes (idempotente)              |
| `pnpm db:seed`                      | tenant, usuários e matriz de permissões                   |
| `pnpm db:seed-market`               | dados de mercado de demonstração (**só dev**)             |
| `pnpm db:seed-stock`                | estoque/retalhos de demonstração (**só dev**)             |
| `pnpm worker:market`                | worker de coleta de mercado (serviço separado no Railway) |

## Estrutura

```
src/
├── app/
│   ├── (app)/            # área autenticada (shell, cadastros, estoque, mercado, vendas)
│   ├── api/              # rotas de API (market, stock, quotes, files, auth)
│   ├── login/            # tela de acesso
│   └── layout.tsx        # fontes, providers e tema
├── components/           # ui/, layout/ (shell), shared/ (DataTable, FormDrawer, ConfirmDialog…)
├── lib/
│   ├── auth/             # Auth.js, RBAC e sessão
│   ├── db/               # schema Drizzle, migrations e seeds
│   ├── market/           # ingestão, indicadores, paridade, alertas
│   ├── stock/            # motor preditivo, movimentos, retalhos, KPIs
│   ├── purchases/        # compras: estado, alçada, versão/hash, recebimento, PDF e CSV
│   ├── metallurgy/       # fórmulas de peso e tempo de corte (puro, testado)
│   ├── quotes/           # precificação, serviço de orçamento, PDF
│   └── storage/          # R2 com fallback local
└── worker/               # market-worker (cron)
```

## Testes e qualidade

```powershell
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

- A suíte cobre o que é crítico e determinístico: motor metalúrgico, precificação/status, delta de mercado,
  normalização de custo de reposição, motor preditivo de estoque, hardening do storage, regras de compras
  (alçada, versão/hash, estados) e recebimento/estorno.
- Os testes de integração com Postgres rodam só com `RUN_DB_TESTS=1` e o banco de dev no ar; eles criam os
  próprios registros e limpam ao final (`pnpm test` sem a variável os ignora).
- **Não** rode `pnpm build` com o `pnpm dev` ativo: os dois escrevem em `.next` e o dev passa a responder 500
  (`Could not find the module ... in the React Client Manifest`). Pare o dev, rode o build, apague `.next` e suba de novo.

## Migrations

```powershell
pnpm db:generate   # gera o SQL a partir de src/lib/db/schema.ts
pnpm db:migrate    # aplica
```

As migrations são **só para frente** (sem `down`). Em produção elas são aplicadas automaticamente no start do
serviço (`drizzle-kit migrate && next start`). Estado atual: `0000` a `0005`, 24 tabelas.

## Deploy

Railway (serviço web + Postgres + worker de mercado). Passo a passo, variáveis, seed de produção e diagnóstico:
[`../docs/deploy.md`](../docs/deploy.md). O CI do GitHub Actions roda lint, `format:check` e build em cada PR.

## Convenções do projeto

- Documentação, specs, commits e comunicação em **PT-BR**; código e identificadores em **inglês**.
- Textos de interface em **PT-BR**.
- Nunca crie regra de produto por conta própria — a spec é o contrato.
- Não suba instância própria do projeto no Docker; use a instância compartilhada.
