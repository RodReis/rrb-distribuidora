# Deploy — MetalAgents (Railway + GitHub Actions)

## Visão geral do pipeline

```
push/PR → GitHub Actions (lint + format + build)  →  merge em main
                                                        ↓
                                          Railway detecta push em main
                                                        ↓
                                    build (Nixpacks): pnpm install && pnpm build
                                                        ↓
                                    start: pnpm drizzle-kit migrate && pnpm start
```

- **CI (`.github/workflows/ci.yml`):** ESLint + Prettier + build com typecheck em todo push/PR.
- **Deploy:** o Railway observa o repositório e faz deploy automático em cada push na `main`.
- **Migrations:** o `startCommand` do `web/railway.json` roda `drizzle-kit migrate` antes de subir o Next.js (release command). Os arquivos de migration estão versionados em `web/src/lib/db/migrations/`.

## Passo a passo do Railway (primeira vez)

1. **Criar projeto:** [railway.com](https://railway.com) → *New Project* → *Deploy from GitHub repo* → `RodReis/rrb-distribuidora`.
   Autorize o acesso do Railway ao repositório na primeira vez.
2. **Root Directory do serviço web:** dentro do serviço criado, *Settings → Root Directory* = `/web`
   (o `railway.json` está nessa pasta e será lido automaticamente).
3. **Adicionar Postgres:** no canvas do projeto → *+ New → Database → PostgreSQL*.
4. **Ligar o banco ao web:** no serviço web → aba *Variables* → *New Variable* → use a referência:
   ```
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   ```
5. **Variáveis de ambiente do serviço web** (aba *Variables*):

   | Variável | Valor | Observação |
   |---|---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | referência ao serviço Postgres |
   | `AUTH_SECRET` | string aleatória ≥ 32 chars | gere com `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | URL pública do deploy (ex.: `https://web-production-xxxx.up.railway.app`) | Railway gera o domínio em *Settings → Networking → Generate Domain* |
   | `RESEND_API_KEY` | chave da API do Resend | convites de usuário por e-mail (US-08) |
6. **Gerar domínio público:** serviço web → *Settings → Networking → Generate Domain* (porta 3000).
   Copie a URL para `NEXTAUTH_URL` e faça o redeploy.
7. **Primeiro acesso:** após o deploy, o banco estará vazio — o schema é criado pelo `drizzle-kit migrate`
   no start. Para popular o tenant + admin + produtos de referência, rode o seed uma vez:
   - Opção A ( Railway Shell, plano Hobby+ ): `pnpm db:seed` no terminal do serviço.
   - Opção B (a partir da sua máquina): aponte `DATABASE_URL` para a URL pública do Railway e rode `pnpm db:seed` localmente (ativo em *Settings → Networking → Public Networking*).

   Login inicial: `rodrigo.reis@gfdistribuicao.com.br` / `Admin@123456` (troque a senha depois do primeiro acesso).
8. **Importação do catálogo real:** com o admin logado, use `/importar` (US-09) para subir o CSV da distribuidora.

## Alternativa de deploy via CLI (opcional)

Se preferir disparar o deploy pelo GitHub Actions em vez da integração nativa do Railway:

1. Crie um **Token** do Railway (Account Settings → Tokens) e adicione o secret `RAILWAY_TOKEN` no repositório GitHub.
2. Crie `.github/workflows/deploy.yml`:
   ```yaml
   name: Deploy (Railway)
   on:
     push:
       branches: [main]
   jobs:
     deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 20
         - run: npm i -g @railway/cli
         - run: railway up --service web
           env:
             RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
   ```

## Checklist pós-deploy (M0)

- [ ] CI verde no GitHub Actions (lint + format + build)
- [ ] Deploy do `main` no Railway concluído com migrations aplicadas
- [ ] Login/logout funcionando na URL pública
- [ ] Convite de usuário chegando por e-mail (Resend configurado)
- [ ] Catálogo importado via `/importar` com relatório de erros
- [ ] Sentry configurado (pendência — task 11: criar projeto no sentry.io e adicionar `SENTRY_DSN` nas variáveis)
