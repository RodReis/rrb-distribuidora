# Débitos técnicos e decisões — MetalAgents (M0)

**Atualizado em:** 01/11/2026 · **Escopo:** estado do código ao encerrar o MVP-00

Como usar este documento: cada item tem **impacto** (por que importa), **correção sugerida** e **esforço**
(P = horas · M = 1–2 dias · G = mais de 2 dias). Os IDs são estáveis; ao resolver um item, mova-o para a
seção 5 com a data e o commit. Itens marcados *(spec)* descumprem algo escrito em
`specs/MVP-00-fundacao.md` ou em `regras-frontend.md`.

---

## 1. Decisões aceitas

### D-01 — Sessão por JWT em vez de sessão em banco *(aceita em 01/11/2026)*

- **Spec:** "Auth.js v5 — Credentials + sessão em banco (tabela `sessions`)"; "logout invalida a sessão".
- **Feito:** sessão por JWT (stateless). A tabela `sessions` existe no schema, mas **não é usada**.
- **Consequências assumidas:**
  - o logout apaga o cookie, mas o token continua válido até expirar (12 h ou 30 dias);
  - alterar papel ou desativar um usuário **não** tem efeito imediato (ver A1, que decorre desta decisão).
- **Quando reabrir:** se A1 for resolvido por consulta ao banco a cada requisição, vale reavaliar trocar para
  sessão em banco (adapter Drizzle) e remover o desvio.

### D-02 — Rate limit do login em memória *(aceita em 01/11/2026)*

- 5 falhas / 15 min por IP, contador em memória do processo. Zera a cada deploy e não é compartilhado entre
  instâncias. Adequado enquanto houver **uma** instância; ao escalar para mais réplicas (ver M8), o contador precisa ir
  para o banco ou para um cache compartilhado.

---

## 2. Prioridade alta — segurança e integridade dos dados

### A1 — Usuário desativado ou com papel alterado mantém o acesso antigo
- **Impacto:** `user.active` só é verificado no **login**. Depois disso o token vale até expirar (até 30 dias).
  Desativar um funcionário desligado **não corta o acesso**; mudar o papel só vale no próximo login. O diálogo de
  desativação em *Usuários & Acesso* diz "as sessões ativas deixam de autenticar novas operações", o que **não é verdade**.
- **Correção:** no `jwt`/`session` callback (ou em `getCurrentUser`), reconsultar `active` e `role` no banco com cache
  curto (ex.: 60 s); **corrigir o texto do diálogo** imediatamente.
- **Esforço:** P · **Origem:** consequência de D-01

### A2 — Sem validação no servidor para produtos, fornecedores e clientes *(spec)*
- **Impacto:** os schemas Zod de `produtos/actions.ts`, `fornecedores/actions.ts` e `clientes/actions.ts` estão
  declarados mas **nunca executados** (`.parse` não é chamado). Quem chama a ação diretamente grava qualquer coisa:
  NCM com letras, dimensões ausentes (peso teórico zerado ou erro na gravação), CNPJ/CPF inválidos. A validação existe só na interface.
  Também faltam as "validações de dimensão por família" e os **dígitos verificadores** de CNPJ/CPF exigidos na US-04/05/06.
- **Correção:** `schema.parse(input)` no início de cada ação; validar dimensões obrigatórias por família; implementar
  validadores de CNPJ/CPF/NCM em `lib/`; mapear erros para mensagens em português.
- **Esforço:** M

### A3 — Primeiro acesso sem troca de senha; sem "esqueci a senha" *(spec)*
- **Impacto:** a US-08 pede "primeiro acesso define a senha". Hoje o convite entrega uma senha temporária que **nunca
  expira nem é trocada**; não existe tela de troca de senha. "Esqueci a credencial" no login só mostra um toast.
  Senha mínima de 10 caracteres (US-01) não é exigida em nenhum fluxo de definição de senha.
- **Correção:** flag `must_change_password` no usuário; tela `/conta/senha`; token de redefinição com expiração e e-mail
  (Resend); validar mínimo de 10 caracteres.
- **Esforço:** M

### A4 — Rotacionar a senha do admin de produção
- **Impacto:** a senha inicial foi gerada durante o deploy e compartilhada em conversa. Deve ser considerada exposta.
- **Correção:** entrar como admin → *Usuários & Acesso* → ícone de chave (gera credencial nova) → guardar em gerenciador
  de senhas. Fazer **antes** de convidar a equipe.
- **Esforço:** P · **Ação imediata**

### A5 — Backup do Postgres não configurado nem testado
- **Impacto:** todos os dados de negócio estão em um único volume. Não há rotina de backup que tenhamos criado nem
  teste de restauração. Perda do volume = perda do catálogo.
- **Correção:** habilitar/confirmar backups no Railway (ou `pg_dump` agendado para storage externo) e **executar uma
  restauração de teste**; documentar RPO/RTO.
- **Esforço:** M

### A6 — Nenhum teste automatizado *(spec)*
- **Impacto:** a spec exige testes unitários de `lib/metallurgy/weight.ts` contra tabela técnica (erro < 1%, "será
  reusado no M3"). Hoje há **zero** testes. Os testes de RBAC, rate limit e importador foram manuais (scripts descartados).
- **Correção:** Vitest; começar por `weight.ts` (tabela técnica), `getDefaultDensity`, validadores (A2), normalização do
  importador e a matriz de permissões. Depois Playwright para login e CRUD de produto.
- **Esforço:** M

### A7 — Deploy não depende do CI, e o CI nunca foi conferido
- **Impacto:** o Railway publica a cada push na `main`, mesmo que lint/build falhe no GitHub Actions. A execução do CI
  nunca foi verificada na aba *Actions*.
- **Correção:** conferir a aba *Actions*; ativar "Wait for CI" no serviço do Railway; proteger a `main` (PR obrigatório).
- **Esforço:** P

### A8 — Geração de SKU sujeita a colisão
- **Impacto:** `generateNextSku` usa `count(*) + 1` por família. Duas criações simultâneas geram o mesmo SKU e uma falha
  por violação de unicidade; apagar manualmente linhas também pode reaproveitar números.
- **Correção:** sequência por família no banco (tabela de contadores com `UPDATE ... RETURNING` ou `SEQUENCE`), dentro da
  mesma transação do insert; o importador (`generateNextSkuTx`) deve usar o mesmo mecanismo.
- **Esforço:** P

### A9 — Botões que fingem executar a ação
- **Impacto:** em `/produtos`, **"Inativar em Lote"**, **"Reajustar Margem Mínima"** e **"Gerar Relatório Analítico"** só
  exibem um toast como "Inativação em lote executada" — **nenhum dado muda**. O usuário acredita que a operação ocorreu.
- **Correção:** implementar (inativação em lote com `ConfirmDialog` + auditoria) ou remover/desabilitar com selo "Em breve".
- **Esforço:** P (remover) · M (implementar)

---

## 3. Prioridade média — conformidade com a spec e qualidade

### M1 — Falta o `DataTable` compartilhado; paginação, ordenação e filtros incompletos *(spec)*
- Cada tela monta a própria tabela (as regras exigem o componente padrão `DataTable`).
- **Paginação 25/50/100 não funciona:** o seletor é decorativo e a tela mostra "1 a N" fixo.
- **Ordenação por coluna** não existe; faltam os filtros **norma** e **unidade** em produtos; o estado dos filtros **não
  está na URL** (a spec pede "server-rendered, URL como estado").
- Toda a lista é carregada e filtrada **no navegador** — não escala para catálogos grandes.
- **Correção:** `DataTable` + `SearchFilterBar` + `Pagination` em `components/shared/`, com consulta paginada no servidor.
- **Esforço:** G

### M2 — Componentes que as regras proíbem *(spec)*
- `components/ui/select.tsx` usa **`<select>` nativo** estilizado; checkboxes são `<input type="checkbox">` nativos
  (login, tabela de produtos); o seletor de página também. As regras pedem Select/Checkbox customizados.
- Ícones são **Lucide**; as regras citam **Material Symbols**.
- **Esforço:** M

### M3 — Definition of Done de CRUD incompleto *(spec)*
- Falta a ação **Detalhe** (visualização somente leitura) em todas as entidades.
- **Depósitos e Máquinas** não têm inativar/excluir na interface.
- **Usuários, Depósitos e Máquinas** sem busca, filtro ou paginação.
- Sem **skeleton de loading** nem estado de **erro com retry**; sem abas nas telas longas.
- **Esforço:** M

### M4 — Números fictícios fixos na interface
- Produtos: "+14 novos este mês", "99,4%", "Chapas 42% · Bobinas 28% · Tubos 30%", "0 SKUs sem desvio".
- Fornecedores: "Lead time médio 21 dias". Clientes: "3 segmentos", "100% conformidade".
- Barra superior (LME, HRC, PTAX, latência) e telemetria do login são estáticas (o login é permitido pela spec até o M1).
- **Correção:** calcular a partir do banco ou remover; o ticker passa a ser real com o M1.
- **Esforço:** P

### M5 — RBAC só protege algumas telas; 403 devolve HTTP 200
- O middleware só **autentica**; a autorização por papel está pontualmente em `admin/usuarios`, `admin/auditoria` e
  `importar`. A coluna `can_read` da matriz **nunca é consultada** nas páginas (hoje todos leem tudo, então coincide).
  As ações de escrita estão protegidas (testado em produção).
- A tela de acesso negado responde **HTTP 200**, não 403.
- **Correção:** mapa rota → módulo e guard central (middleware ou layout); usar `forbidden()` do Next quando estável.
- **Esforço:** M

### M6 — Desvios do modelo de dados da spec *(spec)*
- IDs são UUID v4 (`gen_random_uuid`), a spec pede **UUID v7**.
- Falta o índice **trigram** em `products.commercial_description` (a busca textual usa `ILIKE` no cliente).
- `sku`, `erp_code`, `cnpj` e `document` são únicos **globalmente**, não por tenant.
- `warehouses` e `machines` não têm `created_by`/`updated_by` (a spec pede em todas as tabelas).
- Não há helper de filtro por `tenant_id`: cada query filtra manualmente (fácil esquecer em módulos futuros).
- `sessions` (ver D-01) e `import_jobs.file_key` sem uso; o **helper do Cloudflare R2** que a spec cita como "pronto" **não existe**.
- **Esforço:** M

### M7 — A auditoria só *parece* imutável
- A tela exibe o selo **"APPEND-ONLY"**, mas nada no banco impede `UPDATE`/`DELETE` em `audit_log` (a limpeza do teste de
  RBAC apagou linhas). A tela lista só os últimos 300 eventos, sem paginação.
- **Correção:** `REVOKE UPDATE, DELETE` para o usuário da aplicação ou trigger bloqueante; paginação e filtro por período.
- **Esforço:** P

### M8 — Healthcheck e migrations no start
- Sem `healthcheckPath` (nem rota `/api/health`): o Railway considera o container pronto assim que o processo sobe.
- Migrations no comando de start competem entre si se houver mais de uma réplica.
- **Correção:** rota de saúde + `healthcheckPath`; mover migrations para etapa única (release/pre-deploy).
- **Esforço:** P

### M9 — Sem ambiente de homologação e sem plano de rollback de banco
- Só existe `production`. Migrations são só para frente; rollback de código pode ficar incompatível com o schema.
- **Esforço:** M

### M10 — Sentry incompleto
- Source maps desabilitados (pilhas do navegador minificadas); captura automática de erros reais de requisição
  (`onRequestError`, `global-error`) **configurada mas não exercitada**; sem `release`; amostragem fixa de 10%.
- **Esforço:** P

### M11 — E-mail de convite limitado
- Remetente atual `onboarding@resend.dev` só entrega ao dono da conta Resend. Para convidar a equipe é preciso verificar
  um domínio e trocar o `from` em `lib/email/resend.ts`.
- **Esforço:** P (depende do domínio)

### M12 — Dados de exemplo em produção
- Três produtos do template foram importados para produção (`SKU-CG-0001`, `SKU-BOB-0001`, `SKU-INX-304-200`).
- **Correção:** inativar (a exclusão é lógica) ou remover direto no banco **antes** de importar o catálogo real.
- **Esforço:** P

### M13 — Importador não validado com dados reais
- Testado apenas com o template. Limites: 5.000 linhas / 8 MB, tudo em memória e em uma única transação; o mapeamento de
  colunas não é salvo entre importações; só gera relatório de erros em CSV.
- **Correção:** rodar o dry-run com o CSV real da distribuidora e ajustar normalização (famílias, unidades, NCM).
- **Esforço:** M (depende do arquivo)

---

## 4. Prioridade baixa — manutenção

| ID | Débito | Correção sugerida | Esforço |
|---|---|---|---|
| B1 | ESLint relaxado (`no-explicit-any`, `no-unused-vars`, `prefer-const` desligados); muitos `any` nos componentes | reativar regras e tipar os modelos a partir do schema Drizzle | M |
| B2 | Dependências: `next-auth` ainda é **beta**; Next 15.5 (a 16 existe); 3 vulnerabilidades *moderate* (Sentry); ESLint 9 marcado como obsoleto; CI em Node 20 × produção em Node 24 | alinhar Node (`engines` + `.nvmrc`), planejar upgrade e rodar `pnpm audit` no CI | M |
| B3 | Sem `.gitattributes`; avisos de CRLF no Windows; Prettier normaliza para LF | `* text=auto eol=lf` e `endOfLine: "lf"` | P |
| B4 | Token de cor inexistente `border-carbon-750` em `EmptyState`; logo "GF" é texto, não a imagem do mockup; avisos de build do `jose` (Edge) | corrigir token, usar o asset do logo | P |
| B5 | `web/AGENTS.md` e `web/README.md` são do scaffold (o AGENTS cita docs do Next 16); README da raiz mínimo | reescrever com o fluxo real do projeto | P |
| B6 | Commits só de documentação disparam um deploy completo | *watch paths* no Railway para ignorar `docs/` | P |
| B7 | Fidelidade ao `screen.png` nunca comparada lado a lado, como exigem as regras; validação foi visual, pelo cliente | revisão tela a tela com checklist da seção 10 de `regras-frontend.md` | M |

---

## 5. Resolvidos

| ID | Item | Data |
|---|---|---|
| — | `next@15.2.1` com CVEs críticas (deploy bloqueado) → `15.5.28` + `next-auth` beta.32 + override do `postcss` | 01/11/2026 |
| — | Tela de acesso negado quebrava com HTTP 500 | 01/11/2026 |
| — | Credenciais de desenvolvimento pré-preenchidas na tela de login | 01/11/2026 |
| — | Sem rate limit no login (US-01) | 01/11/2026 |
| — | "Manter sessão ativa" não alterava a duração da sessão (US-01) | 01/11/2026 |
| — | Template CSV de produtos com coluna a mais e auto-mapeamento errado por apelido curto | 01/11/2026 |

---

## 6. Ordem sugerida de ataque

1. **Imediato (horas):** A4 (rotacionar senha do admin) · A1 (corrigir o texto do diálogo) · M12 (limpar exemplos) · A7 (conferir o CI) · A9 (remover botões falsos).
2. **Antes de abrir para a equipe:** A1 (revalidar usuário), A2 (validação no servidor), A3 (troca de senha), A5 (backup + teste de restauração), M11 (domínio do Resend).
3. **Junto com o M1:** A6 (testes, começando por `weight.ts`), A8 (sequência de SKU), M5 (guard central), M7 (auditoria imutável), M8 (healthcheck).
4. **Antes do catálogo crescer:** M1 (DataTable com paginação no servidor), M6 (modelo de dados), M13 (importador com o CSV real).
5. **Contínuo:** M2, M3, M4, M10 e a seção 4.
