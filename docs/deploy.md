# Deploy — MetalAgents (M0)

**Atualizado em:** 01/11/2026 · **Estado:** em produção · **Responsável:** Rodrigo Reis

> Este documento descreve **como a aplicação está implantada hoje**, como operá-la e o que deu
> errado no primeiro deploy. Segredos **nunca** entram aqui nem no repositório: somente os
> **nomes** das variáveis.

---

## 1. Visão geral

| Item | Valor |
|---|---|
| URL de produção | https://rrb-distribuidora-production.up.railway.app |
| Plataforma | Railway |
| Projeto / ambiente | `amusing-abundance` / `production` |
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
      ├──► GitHub Actions (.github/workflows/ci.yml): lint + prettier + build   ← informativo, NÃO bloqueia o deploy
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

## 5. Banco de dados

- **Serviço:** Postgres do Railway com volume persistente.
- **Acesso externo:** o TCP Proxy **não está habilitado**; não existe `DATABASE_PUBLIC_URL`. O banco só é
  alcançável de dentro do Railway (`railway ssh`) ou pelo CLI (`railway connect Postgres`, exige `psql`).
- **Schema:** 11 tabelas, criadas por `drizzle-kit migrate` (migration `0000_strange_misty_knight`).
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

Usa Node **20**, enquanto produção roda Node **24** (ver débito B2). **A execução do CI no GitHub ainda não foi
conferida** (aba *Actions* do repositório).

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

## 12. Estado de produção em 01/11/2026

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
