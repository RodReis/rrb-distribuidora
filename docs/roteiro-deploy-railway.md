# Roteiro de deploy no Railway — M1 a M4

Estado em 02/11/2026. Complementa o [`deploy.md`](deploy.md) (que descreve a infraestrutura) com a **ordem exata** para colocar no ar o que está pendente e homologar com dados reais.

## 0. Situação de partida

| Item | Situação |
|---|---|
| `origin/main` | No merge do PR #6 (M3). Produção deve ter as migrations até `0005` |
| Branch local `feat/mvp-03-orcamentos` | 2 commits à frente do `origin/main` (M4 e merge do PR #7) e 1 atrás, além de **85 arquivos sem commit** (dashboard, tema claro, correção OR2, expiração, sequência de retalho, UI de retalhos) |
| Migrations pendentes em produção | `0006` (tabelas `agent_actions` e `daily_briefings`), `0007` (`agent_actions.user_id` anulável), `0008` (sequência `remnant_code_seq`) |
| Jobs novos para o worker | `generate-daily-briefing` (06:55) e `expire-quotes` (de hora em hora) |
| Variável ausente do `deploy.md` | `OPENAI_API_KEY` (Copiloto e briefing). Já adicionada ao §4.1.1 do `deploy.md` |

Confirme a linha das migrations antes de começar (ver passo 1).

## 1. Antes de subir: conferir produção (somente leitura)

```powershell
railway status
railway deployment list --service rrb-distribuidora
railway connect Postgres        # exige psql local
```

```sql
select count(*) from drizzle.__drizzle_migrations;   -- esperado antes do deploy: 6 (0000 a 0005)
select count(*) from products;  select count(*) from stock_lots;  select count(*) from quotes;
```

Se a contagem das migrations for diferente de 6, pare e investigue antes de seguir.

## 2. Preparar o código (você decide quando commitar)

1. `git fetch origin` e crie uma branch nova a partir do `origin/main`, trazendo os commits do M4 e o trabalho atual. Há 85 arquivos sem commit, então revise o `git status` antes.
2. A partir de `web/`, rode: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm exec prettier --write <arquivos novos>` e `pnpm build`. O CI roda `lint`, `format:check`, os testes unitários e o `build`, mas **sem banco**: os testes de integração ficam pulados. Rode-os você mesmo: `$env:RUN_DB_TESTS="1"; pnpm exec vitest run`.
3. Abra o PR e espere o CI ficar verde. O CI **não bloqueia** o deploy do Railway: o merge na `main` publica de qualquer jeito.

## 3. Variáveis de ambiente a conferir **antes** do merge

No serviço **web** (`rrb-distribuidora`):

| Variável | Para quê | Sem ela |
|---|---|---|
| `OPENAI_API_KEY` | Copiloto e briefing | Copiloto e briefing falham |
| `OPENAI_MODEL` (opcional) | Modelo da IA | Usa `gpt-4o-mini` |
| `CRON_SECRET` | Autenticar os jobs | Jobs respondem 503 |
| `COMMODITY_PRICE_API_KEY` ou `METALS_API_KEY` | Cotações de metais | O job de metais registra erro e não grava nada |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | PDF das propostas | O PDF cai em disco local e **some no próximo deploy** |
| `RESEND_API_KEY` e `RESEND_FROM` | Convites, alertas de mercado e briefing por e-mail | Não envia; o convite mostra a senha na tela |

No serviço **market-worker**: `SERVICE_ROLE=worker`, `CRON_SECRET` (igual ao do web) e `APP_INTERNAL_URL=http://${{rrb-distribuidora.RAILWAY_PRIVATE_DOMAIN}}:8080`.

Com o R2 desligado, não gere propostas em produção.

## 4. Deploy

1. Faça o merge do PR na `main`. O Railway sobe o **web** e o **market-worker** (mesmo repositório).
2. No log do web, confirme `migrations applied successfully!` e `Ready`.
3. Confirme no banco: `select count(*) from drizzle.__drizzle_migrations;` deve dar **9**.
4. Confirme que `remnant_code_seq` existe: `select last_value, is_called from remnant_code_seq;`.
5. No log do worker, a linha de agendamento deve citar `briefing "55 6 * * *"` (todos os dias) e `expiração de propostas "0 * * * *"`.

Se o web não subir, o `startCommand` impede o start (a migration falhou). Veja o §13 do `deploy.md`.

## 5. Reparo do custo de reposição (uma vez)

Só necessário se produção já recebeu entradas ou carga de saldos antes de 02/11/2026:

```powershell
railway ssh --service rrb-distribuidora -- "pnpm db:fix-replacement-cost"          # simulação, não altera nada
railway ssh --service rrb-distribuidora -- "pnpm db:fix-replacement-cost --apply"  # só depois de conferir a lista
```

Depois, dispare o recálculo:

```powershell
curl -X POST https://rrb-distribuidora-production.up.railway.app/api/internal/jobs/calculate-predictive-stock -H "Authorization: Bearer <CRON_SECRET>"
```

## 6. Teste dos jobs em produção (sem esperar o horário)

Cada chamada deve responder 200 e deixar uma linha `[job:...]` no log do web:

| Job | Endpoint | O que conferir |
|---|---|---|
| PTAX | `/api/internal/jobs/ingest-ptax` | Barras novas no mercado PTAX |
| Metais | `/api/internal/jobs/ingest-metals` | Barras novas (exige chave do provedor) |
| Estoque | `/api/internal/jobs/calculate-predictive-stock` | `totalRecalculated` > 0 |
| Briefing | `/api/internal/jobs/generate-daily-briefing` | Um briefing por dia em `daily_briefings` e uma linha em `agent_actions` com `user_id` nulo |
| Expiração | `/api/internal/jobs/expire-quotes` | `ok: true`; `expired` > 0 só se houver proposta vencida |

Sem o token o endpoint deve responder 401.

## 7. Verificação funcional (com um usuário real)

1. `/login` responde 200 e o admin entra.
2. `/mercado`: o gráfico carrega. Anote o tempo (o critério é o painel pronto em até 2 s).
3. `/estoque`: cadastre depósito e produto e importe a carga inicial pelo CSV. **Não** rode `db:seed-stock` em produção.
4. `/estoque?tab=retalhos`: crie um retalho (o código segue `RET-00001…`), reserve, libere e descarte.
5. `/vendas/orcamentos`: crie um orçamento com retalho, gere o PDF e baixe o arquivo. Confirme no bucket R2 a chave `quotes/<tenant>/<número>-proposta.pdf` e **faça um redeploy** para provar que o PDF persiste.
6. Entre com um perfil sem escrita em estoque e confirme que os botões de escrita e as abas Inventário e Carga Inicial somem.
7. Copiloto (Ctrl+K): faça 3 perguntas e confira a resposta com a tela de origem.
8. `/dashboard` e `/governanca` abrem com dados reais; a auditoria registra as ações do passo 4.

## 8. Observar os horários reais (o que não dá para antecipar)

Acompanhe com `railway logs --service market-worker --lines 100` no dia seguinte:

| Horário (São Paulo) | Job | Linha esperada |
|---|---|---|
| 04:00 | Estoque | `calculate-predictive-stock -> HTTP 200` |
| 06:55 | Briefing | `generate-daily-briefing -> HTTP 200` |
| 13:15 e 18:00 | PTAX | `ingest-ptax -> HTTP 200` |
| 19:00 (`METALS_CRON`) | Metais | `ingest-metals -> HTTP 200` |
| De hora em hora | Expiração | `expire-quotes -> HTTP 200` |

## 9. Rollback

- Código: painel Railway → *Deployments* → deploy anterior → *Redeploy*.
- **As migrations `0006` a `0008` não são revertidas.** O código anterior ignora as tabelas e colunas novas, então o rollback de código é seguro.
- Se o briefing ou o Copiloto gerarem custo ou erro inesperado, remova `OPENAI_API_KEY` do web: eles param sem afetar o resto.

## 10. O que você precisa providenciar (resumo)

`OPENAI_API_KEY` · chave do provedor de metais · credenciais do R2 · domínio verificado no Resend · decisão sobre a regra de expiração (OR4) · dados reais de produtos, saldos e clientes.
