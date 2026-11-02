# Deploy — MetalAgents (M0)

**Atualizado em:** 02/11/2026 · **Estado:** em produção · **Responsável:** Rodrigo Reis

> Este documento descreve **como a aplicação está implantada hoje**, como operá-la e o que deu
> errado no primeiro deploy. Segredos **nunca** entram aqui nem no repositório: somente os
> **nomes** das variáveis.

---

## 1. Visão geral

| Item | Valor |
|---|---|
| URL de produção | https://rrb-distribuidora-production.up.railway.app |
| Plataforma | Railway |
| Projeto / ambiente | `Distribuidora-Metal` / `production` (o `railway status` de 02/11/2026 mostra este nome; versões antigas deste documento diziam `amusing-abundance`) |
| Serviço web | `rrb-distribuidora` (Next.js) |
| Serviço de banco | `Postgres` (volume `postgres-volume`) |
| Repositório | https://github.com/RodReis/rrb-distribuidora (branch `main`) |
| Diretório do app | `/web` (monorepo simples: `docs/` + `web/`) |
| Gatilho de deploy | push na `main` (integração nativa Railway ↔ GitHub) |
| Builder | Railpack 0.43.0 |
| Runtime em produção | Node 24.x (padrão do Railpack) · pnpm 10.33.2 (lido do `packageManager`) |
| Framework | Next.js 15.5.28 · Auth.js `next-auth@5.0.0-beta.32` · Drizzle ORM |
| Observabilidade | Sentry (`@sentry/nextjs` 11.10.0) + logs do Railway |

## 2. Pipeline

```
git push origin main
      │
      ├──► GitHub Actions (.github/workflows/ci.yml): lint + prettier + testes + build   ← informativo, NÃO bloqueia o deploy
      │
      └──► Railway detecta o push
              │  build:  pnpm install --frozen-lockfile  →  pnpm run build
              │  start:  pnpm drizzle-kit migrate  &&  pnpm start
              ▼
        container novo sobe → migrations aplicadas → Next.js escuta em $PORT (8080)
```

- As **migrations rodam no comando de start**. Se `drizzle-kit migrate` falhar, o container não sobe.
- O CI e o deploy são **independentes**: o Railway publica mesmo que o CI falhe (ver débito A7).
- Os arquivos de migration ficam versionados em `web/src/lib/db/migrations/`.

## 3. Configuração do serviço no Railway

**Settings do serviço `rrb-distribuidora`:**

| Campo | Valor |
|---|---|
| Source → Root Directory | `/web` |
| Config-as-code → Railway Config File | `/web/railway.json` (caminho absoluto: o Railway **não** segue o Root Directory para esse arquivo) |
| Networking → Public domain | `rrb-distribuidora-production.up.railway.app`, porta **8080** |
| Networking → Private | `rrb-distribuidora.railway.internal` |

**`web/railway.json`:**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "RAILPACK" },
  "deploy": {
    "startCommand": "pnpm drizzle-kit migrate && pnpm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

> O arquivo precisa estar em **UTF-8 sem BOM**. Um BOM faz o Railway falhar com
> `invalid character 'ï' looking for beginning of value`.

Não há `healthcheckPath` configurado (ver débito M8).

## 4. Variáveis de ambiente (serviço web)

| Variável | Valor / origem | Quando é lida | Observações |
|---|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referência ao serviço Postgres) | runtime + migrations | Resolve para o host **interno** `postgres.railway.internal:5432`. Se ficar vazia, o app cai em loop |
| `AUTH_SECRET` | string aleatória ≥ 32 caracteres (`openssl rand -base64 32`) | runtime | **Diferente** do valor de desenvolvimento. Trocar invalida todas as sessões |
| `NEXTAUTH_URL` | `https://rrb-distribuidora-production.up.railway.app` | runtime | **Precisa** do `https://`; só o domínio causa `TypeError: Invalid URL` e HTTP 500 |
| `PORT` | `8080` | runtime | Deve coincidir com a porta do domínio público |
| `RESEND_API_KEY` | chave da API do Resend | runtime | Convites por e-mail. Sem ela o sistema mostra a senha temporária na tela |
| `SENTRY_DSN` | DSN do projeto Sentry | runtime (servidor/edge) | |
| `NEXT_PUBLIC_SENTRY_DSN` | mesmo DSN | **build** | Embutida no JavaScript do navegador na hora do build: alterar exige novo deploy |

Variáveis `RAILWAY_*` são injetadas pela plataforma. `RAILWAY_ENVIRONMENT_NAME` é usada pelo
`drizzle.config.ts` (falha com erro claro se `DATABASE_URL` estiver ausente em produção) e como
`environment` no Sentry.

Também usadas **só no seed de produção** (passadas na linha de comando, nunca gravadas):
`SEED_MODE=production` e `SEED_ADMIN_PASSWORD` (mínimo 12 caracteres).

### 4.1 Variáveis do M1 — Inteligência de Mercado

| Variável | Onde | Observações |
|---|---|---|
| `CRON_SECRET` | web **e** worker | String aleatória longa. Os endpoints `/api/internal/jobs/*` exigem `Authorization: Bearer <valor>`; sem ela respondem 503 |
| `COMMODITY_PRICE_API_KEY` | web (runtime) | Provedor CommodityPriceAPI (cabeçalho `x-api-key`). Confirmar plano e licença antes de usar em produção |
| `METALS_API_KEY` | web (runtime) | Provedor Metals-API. Cada mercado escolhe o seu provedor em *Configuração › Mercado* |
| `METALS_CRON` | web **e** worker | Cron de 5 campos (fuso `America/Sao_Paulo`). Padrão `0 19 * * 1-5`. Valor inválido no worker volta ao padrão |
| `APP_INTERNAL_URL` | worker | URL que o worker usa para chamar o web (ex.: `http://rrb-distribuidora.railway.internal:8080`). Padrão `http://127.0.0.1:3000` |
| `RESEND_API_KEY` | web | Também envia os e-mails de alerta de mercado (`RESEND_FROM` opcional) |

Sem nenhuma chave de provedor, em **produção** o job de metais registra erro e não grava nada (a fixture só existe fora de produção).
A PTAX (Banco Central) não precisa de chave.

### 4.1.1 Variáveis do M4 — Copiloto e briefing

| Variável | Onde | Observações |
|---|---|---|
| `APP_ENCRYPTION_KEY` | web | 64 caracteres hex (32 bytes; `openssl rand -hex 32`). Cifra as chaves de IA por tenant (AES-256-GCM, `lib/crypto/secret-box.ts`). **Obrigatória** para usar a aba de IA; sem ela a tela avisa |
| `OPENAI_MODEL` | web (removida) | Não é mais lida: o modelo de cada empresa vem de **Configuração › Inteligência Artificial** |

**Mudança de 02/11/2026 — chaves de IA por tenant:** `OPENAI_API_KEY` deixou de ser lida do ambiente. Cada empresa cadastra as próprias chaves (OpenAI, Anthropic, NVIDIA NIM) na tela de Configuração, cifradas em `ai_provider_credentials`; o modelo padrão do tenant fica em `tenants.ai_default_*`. O Copiloto lista na combo os modelos dos provedores com chave; o briefing usa o modelo padrão. Para migrar: cadastrar a chave na tela, conferir o teste (a listagem de modelos valida a chave) e **remover `OPENAI_API_KEY` do Railway**. A bateria (`pnpm eval:copilot`) usa o modelo padrão do tenant.

Ordem completa de subida: [`roteiro-deploy-railway.md`](roteiro-deploy-railway.md).

### 4.2 Worker de mercado (serviço separado)

O agendamento é um processo próprio, que apenas chama os endpoints protegidos do web:

**Situação (02/11/2026): serviço `market-worker` criado e online no Railway** (ambiente `production`).

- **Como o comando é escolhido:** `web/railway.json` (config no código) sobrepõe o painel, então o `startCommand` decide pela
  variável `SERVICE_ROLE`: com `SERVICE_ROLE=worker` roda `pnpm worker:market`; sem ela, `pnpm drizzle-kit migrate && pnpm start`
  (o web, como antes). `tsx` está em `dependencies` porque o worker roda via `tsx` na imagem.
- **Configuração do serviço:** mesmo repositório, branch `main`, root directory `web`; variáveis `SERVICE_ROLE=worker`,
  `CRON_SECRET` (igual ao do web), `APP_INTERNAL_URL=http://${{rrb-distribuidora.RAILWAY_PRIVATE_DOMAIN}}:8080`.
  `METALS_CRON` é opcional (padrão `0 19 * * 1-5`).
- **Horários (fuso São Paulo):** PTAX às **13h15** e **18h00** e metais conforme `METALS_CRON`, em dias úteis.
- **Logs:** cada execução sai no stdout do worker (`[market-worker] … HTTP 200 {…}`) e no do web (`[job:ingest-*]`).
- **Verificado em produção:** worker `Online` com o agendamento no log; `POST /api/internal/jobs/ingest-ptax` com o token
  responde 200 e sem token responde 401; o segredo é o mesmo nos dois serviços.

Para recriar o serviço do zero: `railway add --service market-worker --repo <org>/<repo> --branch main --variables …`, depois
definir o root directory `web` (no painel, ou pela API GraphQL — o `railway environment edit --service-config` respondeu
"No changes to apply" para esse campo) e fazer um novo deploy.

Alternativa: usar o *Cron* do Railway chamando `POST /api/internal/jobs/ingest-ptax` e `/ingest-metals` com o Bearer token.

### 4.2.1 Job de estoque preventivo (M2)

- Endpoint: `POST /api/internal/jobs/calculate-predictive-stock` (recalcula cobertura, SS, ROP, status e ABC/XYZ de todos os tenants).
- **Migrations novas a aplicar em produção:** `0007` (`agent_actions.user_id` anulável) e `0008` (sequência `remnant_code_seq`, código de retalho `RET-00001…`). Rode também o dry-run do §4.4.1.
- **Expiração de propostas:** `POST /api/internal/jobs/expire-quotes`, disparado de hora em hora pelo worker (`QUOTE_EXPIRY_CRON`). Confirmar no log `[job:expire-quotes]`.
- **Agendamento:** o `market-worker` dispara o job todos os dias às **04h00** (America/Sao_Paulo; `STOCK_PREDICTIVE_CRON` em `lib/market/schedule.ts`). Só vale depois que o deploy com essa alteração subir no serviço do worker; confirmar a primeira execução no log (`[market-worker] … calculate-predictive-stock -> HTTP 200`).
- **Autenticação:** como os jobs de mercado, exige `Authorization: Bearer <CRON_SECRET>` (503 se a variável não existir, 401 com token errado).
- Além do job, o recálculo ocorre a cada movimentação de estoque e pelo botão "Simular reposição" em `/estoque`.

### 4.3 Carga inicial dos dados de mercado

As migrations rodam sozinhas no start. A carga histórica é manual, uma vez:

```
SEED_MODE=production pnpm db:seed-market   # PTAX (24 meses, BCB) e cadastra os 4 mercados padrão
```

- Em produção **não** gera fixture de metais. O histórico de metais entra por CSV (*Configuração › Mercado › Importar*) ou acumula pela coleta diária.
- CSV: colunas `date` (AAAA-MM-DD), `open`, `high`, `low`, `close`, `volume`; só `close` é obrigatório.

### 4.4 Carga inicial do estoque (M2)

- Em produção as tabelas `stock_*` nascem **vazias** e `/estoque` abre sem dados.
- **Não** rode `pnpm db:seed-stock` em produção: ele grava produtos, fornecedores, lotes e métricas **de exemplo** do mockup (uso só em desenvolvimento).
- Caminho correto: cadastrar produtos e depósitos e importar os saldos pela aba **Carga Inicial (CSV)** de `/estoque` (colunas: SKU, Depósito, Lote, Corrida, Quantidade, Custo Unitário, Data Entrada, Endereço). A importação é atômica: qualquer linha inválida aborta tudo.
- **Unidades do custo:** na importação, **Quantidade** e **Custo Unitário** são **por unidade do produto** (kg, t, m ou un). O sistema converte esse custo para R$/kg ao atualizar o `replacement_cost_base` do produto, que é sempre R$/kg. Produto em `un` sem peso por peça cadastrado não tem conversão: o lote entra, mas o custo de reposição do produto não é alterado.

### 4.4.1 Reparo de `replacement_cost_base` legado (rodar uma vez, antes de usar M2/M3 em produção)

Versões anteriores gravavam o custo do lote (por t ou por un) em `replacement_cost_base`, que é R$/kg. Se produção recebeu entradas de compra ou carga de saldos antes de 02/11/2026, há valores inflados (ex.: R$ 5.420 em vez de R$ 5,42).

1. **Dry-run** (não altera nada): `railway ssh` no serviço web e `pnpm db:fix-replacement-cost`.
2. Confira a lista. "CONVERTER" são produtos em `t`/`un` com custo acima de R$ 150/kg; "REVISAR" nunca é alterado sozinho.
3. Só então: `pnpm db:fix-replacement-cost --apply`. Cada mudança entra na trilha de auditoria (`/admin/auditoria`).
4. Rode o recálculo de estoque (job das 04h00 ou `POST /api/internal/jobs/calculate-predictive-stock`) para atualizar os indicadores.

O limite de R$ 150/kg é um sinal heurístico para sugerir a conversão, não uma regra de negócio: um produto legítimo acima disso aparece como "REVISAR", não é convertido às cegas.

### 4.5 Armazenamento de PDFs (M3)

As propostas comerciais do M3 são geradas no servidor com `@react-pdf/renderer` e gravadas com a chave
`quotes/<tenantId>/<número>-proposta.pdf`. O download passa por `/api/files/download`, que exige sessão,
permissão de leitura em `vendas_orcamentos` e o prefixo do próprio tenant (bloqueia path traversal e chaves de outro tenant).

| Variável | Obrigatória | Observações |
|---|---|---|
| `R2_ACCOUNT_ID` | sim (para R2) | ID da conta Cloudflare; compõe o endpoint `https://<id>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | sim (para R2) | Token de API S3 do R2 |
| `R2_SECRET_ACCESS_KEY` | sim (para R2) | Segredo do token |
| `R2_BUCKET` | sim (para R2) | Nome do bucket |
| `R2_PUBLIC_BASE_URL` | não | Se definida, o link retornado é público (`<base>/<key>`); sem ela, usa `/api/files/download?key=…` |

- **As quatro primeiras variáveis são lidas em conjunto:** faltando qualquer uma, o app cai no fallback local
  (`.data/quotes`), que **não** tem volume persistente no Railway — o PDF some no próximo deploy.
  Em produção, configure o R2 antes de gerar propostas.
- O fallback local é o modo de desenvolvimento e está no `.gitignore` (`web/.data/`).
- Ainda **não homologado em bucket real** (ver `debitos-tecnicos.md`, M3).

## 5. Banco de dados

- **Serviço:** Postgres do Railway com volume persistente.
- **Acesso externo:** o TCP Proxy **não está habilitado**; não existe `DATABASE_PUBLIC_URL`. O banco só é
  alcançável de dentro do Railway (`railway ssh`) ou pelo CLI (`railway connect Postgres`, exige `psql`).
- **Schema:** 24 tabelas, criadas por `drizzle-kit migrate` (migrations `0000` a `0005`):
  - `0003_hesitant_namora` — 5 tabelas do M2: `stock_lots`, `stock_movements`, `stock_remnants`, `stock_predictive_metrics`, `stock_cycle_counts`.
  - `0004_fat_james_howlett` — 3 tabelas do M3 (`quotes`, `quote_items`, `sales_orders`), o valor `oxicorte` no enum `machine_type` e `tenants.min_gross_margin_pct` / `tenants.default_quote_margin_pct`.
  - `0005_lazy_ben_grimm` — `quotes.target_margin_pct` e `quotes.discount_pct`.
- **Aplicação das migrations:** automática no start do serviço web (seção 2). A `0003` foi aplicada em produção no deploy `9c310f41` (02/11/2026), confirmado por consulta em `drizzle.__drizzle_migrations` (4 registros) e pela existência das tabelas `stock_*`. As `0004`/`0005` (M3) foram aplicadas e validadas apenas no **Postgres local**; entram em produção no primeiro deploy após o merge do PR do M3.
- **Migrations:** só para frente (sem `down`). Gerar com `pnpm db:generate`, revisar o SQL e commitar.
- **Seed de produção** (cria tenant, admin e a matriz de 90 permissões; **sem** usuários de teste nem dados de exemplo):

```powershell
railway ssh --service rrb-distribuidora -- "SEED_MODE=production SEED_ADMIN_PASSWORD=<senha-forte-12+> pnpm db:seed"
```

  - Roda **dentro do container**, onde o host interno do banco resolve.
  - É idempotente para tenant/admin/permissões (não duplica).
  - O seed **sem** `SEED_MODE=production` é só para desenvolvimento (cria 5 usuários de teste com senha fraca).
- **Admin de produção:** `rodrigo.reis@gfdistribuicao.com.br`. A senha **não** está documentada; ver débito A4.

## 6. CI (GitHub Actions)

Arquivo: `.github/workflows/ci.yml` — dispara em push e PR para `main`, com `working-directory: web`.

| Passo | Comando |
|---|---|
| Instalação | `pnpm install --frozen-lockfile` |
| Lint | `pnpm lint` |
| Formatação | `pnpm format:check` |
| Build (inclui typecheck) | `pnpm build` (com `DATABASE_URL`/`AUTH_SECRET` de mentira) |

Usa Node **24** (igual à produção). Em 02/11/2026 o CI foi corrigido: `pnpm/action-setup` agora aponta para
`web/package.json` (antes falhava por não achar a versão do pnpm) e o build em Node 20 caía com `SIGSEGV` no
*Collecting page data*. Os PRs #1 e #2 passaram nele. **O CI também roda os Vitest (`pnpm vitest run`)**, mas sem Postgres: os testes de integração (`RUN_DB_TESTS=1`) ficam pulados e só rodam na máquina local.

> **Lição do PR #4:** o `format:check` falha o CI se arquivos novos não passarem no Prettier; rode `pnpm exec prettier --write <arquivos>` antes do push. No Windows o checkout em CRLF faz o `format:check` local acusar arquivos antigos que o CI (Linux) aceita — vale o resultado do CI.

## 7. Observabilidade

**Sentry**
- SDK nos três runtimes: `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`, `src/instrumentation-client.ts`.
- `src/instrumentation.ts` registra o SDK e `onRequestError`; `src/app/global-error.tsx` captura erros de renderização.
- **Privacidade:** `dataCollection` desliga cookies, cabeçalhos, **corpos de requisição**, query params e dados de
  usuário. O padrão do SDK v11 coleta tudo isso (inclusive a senha do login); não relaxe sem decisão consciente.
- Amostragem de traces: 10%. Source maps **desabilitados** (`sourcemaps: { disable: true }` no `next.config.ts`).
- Evento de teste enviado em 01/11/2026 pelo container de produção (`flush` OK).

**Logs**
```powershell
railway logs --service rrb-distribuidora --lines 100
```
Horários nos logs do app estão em UTC; `railway deployment list` mostra em -03:00.

## 8. Segurança da implantação

- Dependências auditadas com `pnpm audit --prod`: **0 high/critical**, 3 moderate (dependências do Sentry).
  O Railway **bloqueia** o deploy se detectar pacote com CVE crítica (ocorreu com `next@15.2.1`).
- Override do pnpm em `web/pnpm-workspace.yaml` força `next>postcss >= 8.5.18`.
- `trustHost: true` no Auth.js (necessário atrás do proxy do Railway).
- **Rate limit do login:** 5 falhas / 15 min **por IP**, em memória. O IP vem do `X-Real-IP`, que o Railway define
  (cabeçalhos forjados pelo cliente não escapam do bloqueio — testado em produção). O contador **zera a cada deploy**.
- **Sessão:** JWT (não há sessão em banco) — 30 dias com "manter sessão ativa", 12 h sem a opção.
  Decisão registrada em `docs/debitos-tecnicos.md` (D-01).
- Senhas com Argon2id; verificação em tempo constante mesmo para e-mail inexistente.

## 9. Operação — comandos do dia a dia

Pré-requisito: `railway login` e, na raiz do repositório, `railway link` (projeto `amusing-abundance`, ambiente `production`).

| Tarefa | Comando |
|---|---|
| Ver estado dos serviços | `railway status` |
| Listar deploys | `railway deployment list --service rrb-distribuidora` |
| Ver logs | `railway logs --service rrb-distribuidora --lines 100` |
| Listar variáveis (sem valores sensíveis na tela) | `railway variables --service rrb-distribuidora --json` |
| Definir variável (dispara redeploy) | `railway variables --service rrb-distribuidora --set "NOME=valor"` |
| Reiniciar com o mesmo código | `railway redeploy --service rrb-distribuidora --yes` |
| Executar comando no container | `railway ssh --service rrb-distribuidora -- "<comando>"` |

> **PowerShell 5:** aspas aninhadas quebram em comandos longos. Para scripts, codifique em base64 e execute com
> `echo <b64> | base64 -d > /app/x.cjs && node /app/x.cjs; rm -f /app/x.cjs`. Para corpos JSON no `curl`, use `--data-binary @arquivo`.

**Novo deploy:** commit + `git push origin main`. Acompanhe com `railway deployment list` até `SUCCESS` e confira `/login` (HTTP 200).

**Rollback:** painel Railway → serviço → *Deployments* → deploy anterior → *Rollback/Redeploy*. As **migrations não são
revertidas** automaticamente; só publique rollback de código compatível com o schema atual.

**Rotacionar `AUTH_SECRET`:** definir a nova variável e aguardar o redeploy. **Todos os usuários serão deslogados.**

**Trocar a senha de um usuário:** painel *Usuários & Acesso* → ícone de chave (gera credencial temporária).

**Variável `NEXT_PUBLIC_*`:** exige novo build; `railway variables --set` já dispara um.

## 10. Primeiro deploy do zero (resumo)

1. Railway → *New Project* → *Deploy from GitHub repo* → `RodReis/rrb-distribuidora`.
2. Serviço web: **Root Directory** `/web` e **Railway Config File** `/web/railway.json`.
3. *+ New → Database → PostgreSQL* (nome do serviço deve ser `Postgres`).
4. Variáveis do serviço web (seção 4). Confirme que `DATABASE_URL` **resolveu** (não está vazia).
5. *Networking → Generate Domain* na porta `8080`; copie a URL **com `https://`** para `NEXTAUTH_URL`.
6. Aguarde o deploy; o log deve mostrar `migrations applied successfully!` e `Ready`.
7. Rode o seed de produção (seção 5).
8. Entre com o admin e gere uma credencial própria.

## 11. Ambiente local

| Item | Valor |
|---|---|
| Postgres local | `docker compose up -d` → `metalagents-postgres` na porta **54320** (a 5432 costuma estar ocupada por outro Postgres) |
| Variáveis | copie `web/.env.example` para `web/.env` e ajuste a porta |
| Migrations | `pnpm db:migrate` (a partir de `web/`) |
| Seed de desenvolvimento | `pnpm db:seed` (5 usuários de teste, senha de teste local; **nunca** usar em produção) |
| App | `pnpm dev` (http://localhost:3000) |
| Qualidade | `pnpm lint` · `pnpm format:check` · `pnpm build` |

O container Postgres local já parou sozinho várias vezes durante o desenvolvimento; se aparecer `ECONNREFUSED`
na porta 54320, rode `docker compose start`.

> **Não rode `pnpm build` com o `pnpm dev` ativo.** Os dois escrevem em `web/.next`; o dev passa a responder **500**
> (`Could not find the module ... in the React Client Manifest`). Pare o dev, rode o build, apague `web/.next`
> (`Remove-Item -Recurse -Force .next`) e suba o dev de novo. O mesmo vale para `EADDRINUSE`: confira os PIDs donos
> da porta 3000 (`Get-NetTCPConnection -LocalPort 3000`) e encerre-os antes de reiniciar.

## 12. Estado de produção

**Atualização 02/11/2026, 15h24 (PR #8: M4 + homologação de M1 a M3):** web `55a989df` e `market-worker` `600600d0`, ambos SUCCESS. Migrations `0006`, `0007` e `0008` aplicadas (9 registros em `drizzle.__drizzle_migrations`; `remnant_code_seq` criada; `agent_actions.user_id` anulável). `/login` responde 200. O worker registrou os 5 agendamentos (PTAX, metais, estoque 04:00, briefing 06:55, expiração de hora em hora). Jobs chamados com o token: `expire-quotes` (200, nada a expirar), `calculate-predictive-stock` (200, 3 produtos) e `ingest-ptax` (200, 0 novos: 02/11 é feriado e o PTAX tem 499 pontos até 30/10); sem token respondem 401. Dados em produção: 3 produtos, 1 usuário, nenhum lote, orçamento ou retalho. **Pendente:** variáveis `R2_*` e chave do provedor de metais (os 3 mercados de metais estão sem dados), job do briefing não testado (envia e-mail e consome a OpenAI), primeira execução automática de cada horário não observada, reparo `db:fix-replacement-cost` desnecessário por ora (sem lotes).

**Atualização 02/11/2026 (M2):** deploy `9c310f41` (SUCCESS, 23:09 -03:00) após o merge do PR #4 (`9f49325`); migration `0003` aplicada; tabelas `stock_*` vazias; job de recálculo 04h00 **não agendado**; `/estoque` **não** foi testado em produção (apenas log de start `Ready` e consulta ao banco). Os itens abaixo são do snapshot de 01/11/2026.

**M3 — Orçamentos (02/11/2026):** implementado e validado **apenas localmente**; ainda **não** foi para produção.
No próximo deploy, o `startCommand` aplica as migrations `0004` e `0005` automaticamente — depois disso, configurar as
variáveis `R2_*` (seção 4.5) antes de gerar a primeira proposta, senão o PDF fica no fallback local sem persistência.

### Snapshot de 01/11/2026

| Item | Situação |
|---|---|
| Deploy ativo | `20c36dea` (SUCCESS) · código `4e3f2d1` |
| Usuários | 1 (admin) |
| Dados | 3 produtos de exemplo importados do template (`SKU-CG-0001`, `SKU-BOB-0001`, `SKU-INX-304-200`); 0 clientes; 0 fornecedores |
| Auditoria | 3 eventos (importação) |
| Testes em produção | login, RBAC com 3 papéis (leitura e **escrita**), rate limit, importador CSV com dry-run, auditoria |
| Dados de teste do RBAC | removidos após o teste |

## 13. Incidentes do primeiro deploy (referência para diagnóstico)

| Sintoma | Causa | Correção |
|---|---|---|
| `Railpack could not determine how to build the app` | Root Directory apontava para a raiz do repositório (sem `package.json`) | Root Directory `/web` |
| `failed to parse web/railway.json ... invalid character 'ï'` | Arquivo gravado com BOM (PowerShell) | Regravar em UTF-8 sem BOM |
| Builder `NIXPACKS` ignorado | Nixpacks foi substituído pelo Railpack | `"builder": "RAILPACK"` |
| `Railway cannot proceed ... security vulnerabilities` | `next@15.2.1` com CVEs críticas | Atualizado para `15.5.28`; `next-auth` para beta.32 |
| `Application not found` (404 do edge) | Nenhum container saudável por trás do domínio | Resolver os itens abaixo |
| Crash em loop em `applying migrations...` | `DATABASE_URL` vazia (referência `${{Postgres...}}` salva em branco / sem serviço Postgres) | Criar o Postgres e definir a referência |
| `DATABASE_URL não definida` | Variável nunca aplicada (campo ficou em modo de edição) | Definir pelo CLI: `railway variables --set` |
| `/login` HTTP 500, `TypeError: Invalid URL` | `NEXTAUTH_URL` sem `https://` | Corrigir o valor |
| Login recusado com a senha certa | Tela de login vinha pré-preenchida com a senha de desenvolvimento | Removido o pré-preenchimento |
| `/admin/*` HTTP 500 para papéis sem permissão | Botão com `onClick` dentro de componente de servidor (`Forbidden`) | Trocado por `<Link>` |

## 14. Referências

- Débitos técnicos e decisões: [`debitos-tecnicos.md`](debitos-tecnicos.md)
- Regras de interface: [`regras-frontend.md`](regras-frontend.md)
- Spec do M0: [`specs/MVP-00-fundacao.md`](specs/MVP-00-fundacao.md)
- Railway — limites e cabeçalhos: https://docs.railway.com/networking/public-networking/specs-and-limits
