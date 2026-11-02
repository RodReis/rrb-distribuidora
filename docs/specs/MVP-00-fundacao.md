# Spec MVP-00 — Fundação

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 31/10/2026
**Duração estimada:** 3 semanas · **Dependências:** nenhuma (primeiro MVP)
**Telas de referência:** `docs/telas/metalagents_acesso_ao_sistema_multi_tenant`, `docs/telas/metalagents_cadastros_estrat_gicos_crud_de_produtos_met_licos_rf_01`
**Regras de implementação:** ⛔ conformidade obrigatória com [`docs/regras-frontend.md`](../regras-frontend.md)

---

## 1. Objetivo

Estabelecer a base técnica e operacional do MetalAgents: autenticação com papéis, shell navegável com o design system industrial, cadastros essenciais (RF-01) e migração dos dados atuais da distribuidora via CSV. Ao final do M0, a equipe acessa o sistema e o catálogo de produtos está vivo — sem depender de planilha.

**Valor entregue:** dados operacionais centralizados + infraestrutura pronta para os MVPs seguintes.

## 2. Decisões técnicas (fechadas)

| Tema | Decisão |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict |
| UI | Tailwind + shadcn/ui; tokens do `docs/telas/metalagents_industrial_intelligence/DESIGN.md` (carbon dark) como tema default |
| ORM | Drizzle ORM + drizzle-kit (migrations versionadas no repo) |
| Auth | Auth.js v5 — Credentials (e-mail+senha, hash Argon2id) + sessão em banco (tabela `sessions`) |
| Tenancy | Coluna `tenant_id` em todas as tabelas de negócio; filtro aplicado app-level (helper de query). 1 tenant seed |
| Storage | Cloudflare R2 (não usado no M0, mas SDK + helper prontos) |
| E-mail | Resend (magic link opcional, convite de usuário) |
| Infra | Railway: serviços `web` (Next.js) + `postgres`; secrets via variáveis do Railway |
| CI/CD | GitHub Actions: lint + typecheck + build; deploy no Railway via push em `main` |
| Erros | Sentry (frontend + server) |

## 3. User Stories e critérios de aceite

### US-01 — Autenticação
Como **usuário da equipe**, quero fazer login com e-mail e senha para acessar o sistema.

- Formulário conforme mockup (e-mail corporativo, senha com toggle de visibilidade, "manter sessão ativa")
- **Adaptações ao mockup:** remover botão SSO SAML (fase SaaS); esconder o select "Unidade Operacional (Tenant)" — single-tenant no M0 (o campo retorna na fase SaaS)
- Painel de "Telemetria de Conexão" do mockup fica estático (decorativo) até o M1
- Sessão: 30 dias se "manter sessão ativa", senão 12h; logout invalida a sessão
- Rate limit no login (5 tentativas/15 min por IP); senha mínima 10 caracteres
- **Aceite:** login/logout funcionam; sessão expira corretamente; credenciais inválidas não revelam se o e-mail existe

### US-02 — Papéis e permissões (RBAC)
Como **admin**, quero atribuir papéis aos usuários para controlar o acesso por módulo.

- Papéis (enum no banco): `admin`, `diretor`, `comprador`, `vendedor`, `estoque`, `financeiro`
- Matriz de permissões por módulo (tabela `role_permissions`, seed inicial): `admin` = tudo; `diretor` = leitura de tudo; demais papéis = CRUD nos módulos do seu departamento, leitura nos demais
- Middleware de rota + guard em server action: checa papel antes de executar
- **Aceite:** usuário sem permissão recebe 403 (UI amigável) e a ação nunca chega ao banco

### US-03 — Shell da aplicação
Como **usuário**, quero navegar entre módulos por uma sidebar consistente.

- Layout conforme mockup: sidebar fixa (grupos: Operação, Inteligência, Cadastros, Configurações), topbar com busca e menu de usuário
- Módulos futuros (Mercado, Estoque, Orçamentos, Copiloto…) aparecem desabilitados com badge "Em breve"
- Tema carbon dark implementado a partir dos tokens; tema claro fica para depois
- **Aceite:** navegação funcional, 404 customizado, loading states nos handlers

### US-04 — CRUD de Produtos (RF-01)
Como **estoque/admin**, quero cadastrar produtos metálicos com atributos técnicos para serem a base de tudo.

- Tabela conforme mockup: SKU, descrição técnica + dimensões, família & norma, densidade/peso teórico, preço de reposição base, status, ações
- Filtros: família, norma, status, unidade; busca textual; paginação 25/50/100; ordenação por coluna
- Drawer de cadastro/edição com os campos do mockup:
  - `sku` — gerado automaticamente (regra: `FAM-NNNN`, sequencial por família), somente leitura
  - `erp_code` — código ERP externo (TOTVS/SAP), opcional, único
  - `family` — enum: `chapa_grossa`, `bobina`, `tubo`, `perfil`, `barra`
  - `commercial_description` (catálogo/orçamento) e `fiscal_description` (padrão SEFAZ/NF-e)
  - `norm` — texto com autocomplete (ASTM A36, SAE 1008/1020, Inox 304, Alu 5052-H32, A572 Gr.50, SAE 1045 + livre)
  - `ncm` — 8 dígitos, validado
  - Dimensões: `thickness_mm`, `width_mm`, `length_mm` (chapa/bobina), `diameter_mm` (barra/tubo), `wall_mm` (tubo) — exibidas conforme família
  - `density_g_cm3` — default por família (aço 7,85; inox 7,90; alumínio 2,70), editável
  - `unit` — enum: `kg`, `m`, `un`, `t`
  - `weight_per_unit` — **calculado em código** a partir das dimensões × densidade (nunca digitado)
  - `replacement_cost_base` — **sempre R$/kg**, qualquer que seja a unidade comercial (será referência do M3). O custo de lote e de movimento de estoque, ao contrário, é por unidade do produto; a conversão fica em `lib/stock/units.ts`
  - `status` — enum: `ativo`, `inativo`, `homologacao`
- Exclusão lógica (status inativo); produto com movimentos nunca é apagado
- **Aceite:** CRUD completo; peso teórico calculado com erro < 1% vs tabela técnica; validações de dimensão por família

### US-05 — CRUD Fornecedores
- Campos: razão social, CNPJ (validado), fantasia, contatos, cidade/UF, tipo (usina, distribuidor, trader), lead time padrão (dias) — usado no M2, condições de pagamento, observações
- **Aceite:** CRUD com busca; CNPJ duplicado bloqueado

### US-06 — CRUD Clientes
- Campos: razão social, CNPJ/CPF (validado), fantasia, contatos, cidade/UF, inscrição estadual, segmento, observações
- Campos de crédito/limite ficam para o módulo Financeiro — não criar agora
- **Aceite:** CRUD com busca

### US-07 — Depósitos e Máquinas
- Depósitos: nome, endereço, tipo (matriz, filial, pátio), ativo
- Máquinas: nome, tipo (laser, plasma, guilhotina, serra, dobra, slitter), custo/hora (usado no M3), setup min, ativo
- **Aceite:** CRUD simples, sem complexidade extra

### US-08 — Gestão de usuários (admin)
- Convidar usuário por e-mail (Resend), definir papel, desativar
- **Aceite:** convite chega por e-mail, primeiro acesso define a senha

### US-09 — Importação CSV (catálogo)
Como **admin**, quero importar o catálogo atual via CSV para não digitar tudo.

- Upload com mapeamento de colunas (preview das 10 primeiras linhas), template CSV para download
- Validação linha a linha: erros listados e exportáveis; importação transacional
- Upsert por `erp_code` ou `sku`; dry-run antes de confirmar
- **Aceite:** catálogo real da distribuidora importado com zero correção manual; relatório de linhas rejeitadas
- **⚠️ Ajuste de escopo vs. plano v1.0:** importação de **estoque inicial** (saldos/lotes) move-se para o **M2**, quando o modelo de lotes/movimentos existir. O M0 importa: produtos, fornecedores, clientes

### US-10 — Auditoria e rastreabilidade
- `created_by` / `updated_by` em todas as tabelas; tabela `audit_log` (quem, o quê, antes/depois em JSONB) para operações de escrita em cadastros
- **Aceite:** qualquer alteração de cadastro é rastreável

## 4. Modelo de dados (Drizzle — DDL resumido)

```ts
tenants      (id uuid pk, name, slug unique, active, created_at)
users        (id uuid pk, tenant_id fk, email unique, name, password_hash, role enum, active, last_login_at, created_at)
sessions     (id uuid pk, user_id fk, token unique, expires_at, created_at)          -- adapter Auth.js
role_permissions (role enum, module enum, can_read bool, can_write bool, pk(role, module))

products     (id uuid pk, tenant_id fk, sku unique, erp_code unique nullable,
              family enum, commercial_description, fiscal_description, norm, ncm char(8),
              thickness_mm numeric, width_mm numeric, length_mm numeric,
              diameter_mm numeric, wall_mm numeric,
              density_g_cm3 numeric default 7.85, unit enum, weight_per_unit numeric,
              replacement_cost_base numeric, status enum default 'ativo',
              created_by fk, updated_by fk, created_at, updated_at)
             -- índices: (tenant_id, family), (tenant_id, status), norm, search trigram em commercial_description

suppliers    (id uuid pk, tenant_id, legal_name, trade_name, cnpj unique, contacts jsonb,
              city, uf, type enum, lead_time_days int, payment_terms, notes,
              created_by, updated_by, timestamps)
customers    (id uuid pk, tenant_id, legal_name, trade_name, document (cnpj/cpf) unique, contacts jsonb,
              city, uf, state_registration, segment, notes, created_by, updated_by, timestamps)
warehouses   (id uuid pk, tenant_id, name, address, type enum, active, timestamps)
machines     (id uuid pk, tenant_id, name, type enum, cost_per_hour numeric, setup_min int, active, timestamps)

audit_log    (id bigserial pk, tenant_id, user_id fk, entity, entity_id, action enum,
              before jsonb, after jsonb, created_at)                        -- partição por mês a partir do M1 se crescer
import_jobs  (id uuid pk, tenant_id, user_id, entity enum, file_key (R2), status enum,
              report jsonb, created_at, finished_at)
```

Convenções: todos os IDs UUID v7; `numeric(12,4)` para medidas/valores; timestamps `timestamptz` default `now()`; enums Postgres nativos.

## 5. Rotas / API

Server Actions para mutações (com revalidation) + Route Handlers REST onde útil:

| Rota | Método | Papel mínimo | Descrição |
|---|---|---|---|
| `/api/auth/*` | — | público | Auth.js (login, logout, callback) |
| `/produtos` | GET | leitura | Tabela + filtros (server-rendered, URL como estado) |
| `/produtos` (action) | POST/PATCH | estoque/admin | Criar/editar (drawer) |
| `/fornecedores`, `/clientes`, `/depositos`, `/maquinas`, `/usuarios` | CRUD | por matriz US-02 | Mesmo padrão |
| `/api/import/[entity]` | POST | admin | Upload → parse → dry-run → commit |
| `/admin/auditoria` | GET | admin/diretor | Trilha de auditoria |

## 6. Mapeamento de telas (mockup → implementação)

| Mockup | Tela | Adaptações |
|---|---|---|
| `telas/metalagents_acesso_ao_sistema_multi_tenant` | `/login` | Remove SSO SAML; esconde select tenant; telemetria estática |
| `telas/metalagents_cadastros_estrat_gicos_...rf_01` | `/produtos` + drawer | 1:1 com o mockup; NCM obrigatório |
| — | `/fornecedores`, `/clientes`, `/depositos`, `/maquinas`, `/usuarios` | Seguem o mesmo padrão visual da tela de produtos (tabela + drawer + filtros) |
| — | Shell/sidebar | Baseado no frame dos mockups (sidebar + topbar) |

## 7. Fora do escopo do M0

Estoque/lotes/movimentos (M2 — inclusive a importação de saldos), cotações de mercado (M1), orçamentos (M3), copiloto (M4), tema claro, mobile/PWA, SSO SAML, NF-e, multi-tenant real.

## 8. Critérios de aceite (checklist final)

- [ ] Login/logout com sessão em banco; rate limit ativo
- [ ] RBAC bloqueia escrita e leitura conforme matriz (testado com 3 papéis)
- [ ] CRUD de produtos 1:1 com mockup, SKU auto, peso teórico < 1% de erro
- [ ] CRUD fornecedores, clientes, depósitos, máquinas, usuários
- [ ] Catálogo real importado via CSV com relatório de erros
- [ ] `audit_log` registra toda escrita em cadastro
- [ ] Deploy no Railway a partir do `main`; Sentry capturando erros
- [ ] Migrations rodando via drizzle-kit no deploy (release command)

## 9. Tarefas de implementação (ordem sugerida)

1. Bootstrap do repo: Next.js 15 + TS + Tailwind + tokens do DESIGN.md + ESLint/Prettier + GitHub Actions
2. Provisionar Railway (web + postgres) + variáveis + deploy pipeline
3. Drizzle: schema acima + migrations + seeds (tenant, admin, role_permissions, normas/densidades)
4. Auth.js v5 (credentials + sessão DB) + tela `/login` conforme mockup
5. Middleware RBAC + guard de actions + matriz de permissões
6. Shell/sidebar/topbar + páginas placeholder dos módulos futuros
7. CRUD produtos (tabela + drawer + filtros) — a tela mais rica, fazer primeiro entre os cadastros
8. CRUDs fornecedores/clientes/depósitos/máquinas reutilizando o padrão
9. Gestão de usuários + convite por e-mail (Resend)
10. Importador CSV (produtos, fornecedores, clientes) com dry-run
11. Auditoria + Sentry + polimento (estados vazios, erros, loading)
12. Checklist de aceite + deploy final do M0

## 10. Riscos e notas

- **Auth.js v5 com Credentials + sessão em banco** é estável mas exige cuidado com o adapter Drizzle — validar cedo (tarefa 4 antes de tudo que depende de sessão)
- **Peso teórico** centralizado em módulo puro (`lib/metalurgy/weight.ts`) com testes unitários contra tabela técnica — será reusado no M3
- **CSV da distribuidora** pode vir sujo (descrições inconsistentes) — o mapeamento de colunas + dry-run mitiga
- Tokens do Tailwind: extrair o `tailwind.config` direto do `code.html` do mockup (já contém todas as cores/tipos) em vez de redigitar
