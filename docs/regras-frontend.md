# Regras Obrigatórias de Frontend — MetalAgents

**Versão:** 1.0 · **Data:** 01/11/2026 · **Status:** ⛔ OBRIGATÓRIO — aplica-se a todas as specs (MVP-00 a MVP-04) e a qualquer tela nova do projeto
**Fontes de verdade:** `docs/telas/metalagents_industrial_intelligence/DESIGN.md` (tokens) + `docs/telas/*/code.html` (protótipos) + `docs/telas/*/screen.png` (referência visual final)

> **Regra-mãe:** nenhuma tela é considerada concluída se não for fiel ao protótipo, não seguir os tokens e não entregar o CRUD completo conforme o checklist da seção 8.

---

## 1. Fidelidade ao protótipo (inviolável)

1. Cada tela implementada deve ser uma **ré visual 1:1** do seu mockup (`screen.png`) — layout, hierarquia, densidade, cores e microdetalhes.
2. Antes de marcar a tela como concluída, **comparar lado a lado** com o `screen.png` da pasta correspondente.
3. Desvios só são permitidos quando **explicitamente documentados** na coluna "Adaptações" da spec (ex.: remover SSO SAML do login no M0).
4. Proibido "melhorar por conta própria" espaçamentos, tamanhos de fonte, cores ou estrutura de layout. O protótipo manda.
5. O `tailwind.config` deve ser extraído **direto do `code.html` do mockup** (ele já contém todas as cores, fontes e espaçamentos) — nunca redigir tokens à mão.

---

## 2. Design, CSS e Tokens

### 2.1 Paleta (uso obrigatório — nada de cores fora desta lista)

| Grupo | Tokens | Uso |
|---|---|---|
| Superfícies | `carbon-950`, `carbon-900`, `carbon-800`, `carbon-700` | Fundo base (950), containers/painéis (900), cards/hover (800), divisões/seleção (700) |
| Texto | `ice-white`, `subtle-white`, `titanium-light`, `titanium-muted`, `titanium-dark` | Títulos, corpo, metadados, labels secundários, placeholders |
| Ação/marca | `carmine-core`, `carmine-signal`, `carmine-deep`, `carmine-dark` | Botões primários (hover `signal`, active `deep`), foco de input, destaques de marca |
| Sinais de negócio | `signal-buy` (#10B981), `signal-hold` (#F59E0B), `signal-risk` (#EF4444) | Badges e indicadores de status preditivo: comprar/ok, neutro/atenção, risco/ruptura |
| Feedback | `tertiary` (#4edea3) e containers de erro do token | Sucessos e erros em formulários/toasts |

- Tema **carbon dark é o padrão**. O tema claro (`industrial_precision_steel`) existe para o app inteiro, escolhido no alternador sol/lua da barra superior e guardado no navegador.
- **Proibido:** cores hexadecimais inline fora do config, `bg-gray-*`, `bg-slate-*`, `text-blue-*` ou qualquer paleta nativa do Tailwind que não seja token do projeto.

### 2.1.1 Como o tema funciona (obrigatório para telas novas)

- Os tokens que mudam com o tema (`carbon-*`, `ice-white`, `subtle-white`, `titanium-*`, `signal-*`, `carmine-signal`, `tertiary`) são **variáveis CSS** em `src/app/globals.css` (`:root` = escuro, `.light` = claro). Use sempre a classe do token; nunca o valor.
- `carmine-core`, `carmine-dark` e `carmine-deep` (marca) são fixos nos dois temas. Texto sobre fundo sólido de marca ou de sinal (`bg-carmine-*`, `bg-signal-*`) fica branco no claro por regra do CSS global.
- No claro os sinais usam tons mais escuros que no escuro (verde `#127236`, âmbar `#9A440A`, vermelho `#C81E1E`) para manter contraste de texto sobre branco. Valem os tokens, não os hex do `DESIGN.md`.
- **SVG:** use classes `fill-*` e `stroke-*` com o token (ex.: `stroke-carmine-core`), não atributos com hex.
- **Bibliotecas que não leem CSS** (gráficos): peça a cor com `themeColor("token")` (`lib/theme.ts`) e recrie o gráfico quando `useTheme()` mudar (exemplo: `market-chart.tsx`).
- **Itens impressos** (etiqueta, QR) usam `bg-paper` e `text-ink`: branco com tinta escura nos dois temas.
- Chip colorido sobre botão de cor sólida: use `bg-black/25 text-white`, nunca `bg-carbon-*`, que clareia no tema claro.
- **Camadas:** o Copiloto fica em `z-40`; drawers e modais em `z-50`, para cobri-lo.

### 2.2 Tipografia

| Classe | Fonte | Uso |
|---|---|---|
| `font-headline-*` | Inter (600/700) | Títulos de página, seções e cards |
| `font-body-*` | Inter (400) | Texto corrido, descrições de produto |
| `font-label-caps` | Inter 600, uppercase, tracking `0.05em` | Labels de formulário, cabeçalhos de coluna |
| `font-label-code` | JetBrains Mono | Micro-labels técnicos, IDs, status |
| `font-metric-*` | JetBrains Mono | **Todo número exibido**: preços, pesos, dimensões, percentuais, deltas |

- **Regra de ouro:** número é sempre `JetBrains Mono` com alinhamento à direita em tabelas (evita "pulo" de coluna em atualizações ao vivo). Ex.: `1200x3000x6.35mm`, `R$ 7,45/kg`, `+2,4%`.
- Nenhum texto de UI em outra fonte além de Inter/JetBrains Mono.

### 2.3 Formas, bordas e profundidade

- Raio máximo `0.375rem` (6px) em painéis; `0.25rem` (4px) em botões/inputs/badges. **Proibido pill/cápsula** (`rounded-full` só no indicador de status pulsante do login).
- Toda borda: `1px` — `rgba(255,255,255,0.08)` ou `titanium-steel` a 20–30% de opacidade.
- Container ativo/focado: borda dupla `0 0 0 1px #DC2626` (carmine-core) + sombra técnica. **Proibido glow/blur decorativo** (exceto os halos de fundo já presentes nos mockups).
- Elevação por **camadas tonais** (carbon-950 → 900 → 800 → 700), nunca por drop-shadow generoso. Sombras: apenas `0 8px 24px -4px rgba(0,0,0,0.8)` em modais/overlays.

---

## 3. Padrão de componentes (nada genérico, nada nativo)

### 3.1 Proibições absolutas

| Proibido | Obrigatório no lugar |
|---|---|
| `<select>` nativo | Componente Select customizado (dropdown carbon-950, borda carbon-700, focus carmine) |
| `<input type="checkbox">` / `<input type="radio">` nativos | Switch/checkbox estilizado do design system |
| `<dialog>`, `window.alert`, `window.confirm`, `window.prompt` | `FormDrawer` (formulários) e `ConfirmDialog` (confirmações) |
| Tabela HTML estilizada "do zero" a cada tela | Componente `DataTable` padrão (seção 3.3) |
| `alert()` para mensagens | **Toast** (seção 4) |
| Botão cinza/azul padrão | Botões carmine/titanium conforme DESIGN.md |

### 3.2 Organização de componentes

```
src/components/
  ui/          → primitivos estilizados 1x (Button, Input, Select, Checkbox, Badge, Tabs, Tooltip, Dialog, Drawer, Toast)
  shared/      → compostos padrão de tela (DataTable, PageHeader, Breadcrumbs, SearchFilterBar, MetricTile, StatusBadge, EmptyState, FormDrawer, ConfirmDialog, Pagination)
  features/    → compostos de domínio (QuoteItemBuilder, RuptureMatrixTable, RemnantCard, MarketChart...)
```

- Componentes `ui/` e `shared/` são a **única** forma permitida de montar telas. Se um padrão visual se repete 2×, vira componente em `shared/`.
- Base: shadcn/ui **customizado** com os tokens do projeto (nunca o tema default do shadcn).

### 3.3 Componentes padrão obrigatórios (contrato)

| Componente | Contrato mínimo |
|---|---|
| `PageHeader` | Título `headline-lg` + subtítulo/descrição + área de ações à direita (botões primário/secundário) |
| `Breadcrumbs` | Trilha obrigatória (seção 6) |
| `DataTable` | Grid terminal do DESIGN.md: linhas 32–36px, header em `label-caps` sobre `carbon-950`, zebra `carbon-900`/`carbon-800` 40%, numéricos mono à direita, coluna de ações à direita, ordenação por clique no header, paginação 25/50/100 |
| `SearchFilterBar` | Busca textual + selects de filtro em linha, respeitando selects customizados |
| `StatusBadge` | 1px border + fundo 12% de opacidade + texto na cor do sinal + beacon pulsante de 4px (`signal-buy/hold/risk`) |
| `MetricTile` | `carbon-900`, metadado superior em `label-caps` `titanium-muted`, valor em `metric-display` mono |
| `FormDrawer` | Drawer lateral (carbon-900) para criar/editar, com título no formato do mockup ("+ Cadastrar Novo..." / "Edição de ... - {id}") |
| `ConfirmDialog` | Modal para qualquer ação destrutiva (excluir, ajuste de inventário) — **nunca** confirm via browser |
| `EmptyState` | Ilustração/ícone + mensagem em português + CTA da ação principal (ex.: "Nenhum retalho encontrado — cadastrar retalho") |
| `Pagination` | Padrão da tabela com seletor 25/50/100 |

- **Todo componente interativo deve ter os 4 estados:** `default`, `hover`, `active/pressed`, `disabled` + estados de tela `loading` (skeleton carbon-800, nunca spinner genérico colorido), `empty` (EmptyState) e `error` (com ação de retry).

### 3.4 Grids, tabelas e formulários

- **Grid:** 12 colunas, gutter `0.75rem` (12px), padding em múltiplos de 4px, margem `1rem`. KPIs em tiles iguais; conteúdo principal à esquerda/centro, ações contextuais à direita.
- **Tabelas:** sempre `DataTable` — nunca recriar estilos de tabela por tela. Colunas técnicas em mono, descrições em Inter.
- **Formulários:** sempre dentro de `FormDrawer` ou modal carbon — nunca inline solto. Label sempre `label-caps` uppercase com unidade no label (`ESPESSURA [MM]`, `CUSTO DE REPOSIÇÃO BASE (R$/KG)`), campos dimensionais/monetários com formatação mono e input `carbon-950` com borda `carbon-700`, focus ring carmine **sem glow**.

---

## 4. Mensageria — Toast obrigatório

**Biblioteca única:** `sonner` (integrado ao shadcn/ui), configurado com tema dark e os tokens do projeto.

```tsx
// app/layout.tsx
import { Toaster } from "@/components/ui/sonner";
<Toaster theme="dark" position="top-right" richColors closeButton />
```

### 4.1 Regras de uso

| Tipo | Quando usar | Exemplo de copy (pt-BR) |
|---|---|---|
| `toast.success` | Operação concluída com efeito no banco | "Produto CHA-0042 cadastrado com sucesso." |
| `toast.error` | Falha de validação, erro de servidor, permissão negada | "Não foi possível salvar. Verifique o NCM informado." |
| `toast.warning` | Sucesso com ressalva / risco de negócio | "Proposta salva, mas abaixo do custo de reposição — aguardando aprovação do diretor." |
| `toast.info` | Informação neutra, sem erro nem sucesso | "2 retalhos compatíveis encontrados para as dimensões informadas." |

### 4.2 Regras rígidas

1. **Proibido** `alert()`, `confirm()`, `prompt()` ou qualquer diálogo nativo do browser — substitutos: toast (feedback) e `ConfirmDialog` (decisão).
2. Toda mutação (criar/editar/excluir/aprovar/importar) **exige toast** de resultado. Sem toast = tela incompleta.
3. Erros de server action/API sempre caem em `toast.error` com mensagem **em português e acionável** ("O CNPJ já está cadastrado"), nunca o texto cru da exceção.
4. Toast de sucesso em ações destrutivas informa o que aconteceu: "Lote LT-2201 excluído. Histórico mantido em auditoria."
5. Duração padrão: 4s (success/info), 6s (warning/error com `closeButton`). Erros críticos podem usar `duration: Infinity` com botão de fechar.
6. Toasts **não substituem** validação inline de formulário: erro de campo aparece no campo (borda carmine + mensagem abaixo) e o toast resume ("Revise os 2 campos destacados").

---

## 5. Estrutura padrão de toda tela

```tsx
<Breadcrumbs items={[{label:"Cadastros", href:"/cadastros"}, {label:"Produtos"}]} />
<PageHeader
  title="Produtos Metálicos"
  description="Catálogo técnico RF-01"
  actions={<><Button variant="secondary">Importar CSV</Button><Button>+ Novo Produto</Button></>}
/>
<SearchFilterBar filters={[...]} search placeholder="Buscar por SKU ou descrição..." />
<DataTable columns={columns} data={data} pagination pageSizeOptions={[25,50,100]} />
```

1. Toda tela interna começa com `Breadcrumbs` → `PageHeader` → conteúdo.
2. Nada de título solto, botão solto ou filtro improvisado fora desse padrão.

---

## 6. Breadcrumbs obrigatórios

1. **Toda** tela interna (exceto `/login`) exibe breadcrumbs no topo.
2. Formato: `Início / {Módulo} / {Submódulo} / {Item atual}` — último nível em `titanium-muted` (não clicável), anteriores clicáveis com hover `ice-white`.
3. Separador: `/` em `label-code` `titanium-dark` (estética terminal do design system).
4. A hierarquia da trilha deve refletir a sidebar (mesmos grupos): `Cadastros / Produtos`, `Vendas / Orçamentos / #1002`, `Estoque / Retalhos / RET-00492`.
5. Em telas de detalhe, o último nível usa o identificador real do registro (`Orçamentos / #1002`).

```tsx
<Breadcrumbs
  items={[
    { label: "Início", href: "/" },
    { label: "Vendas", href: "/vendas" },
    { label: "Orçamentos", href: "/vendas/orcamentos" },
    { label: "#1002" }, // nível atual, sem href
  ]}
/>
```

---

## 7. Abas obrigatórias em telas longas

1. Toda tela cujo conteúdo **exceda ~1.5 viewport de altura** ou possua **2+ seções de conteúdo distintas** (ex.: cadastro + importação; matriz de ruptura + catálogo de retalhos) deve usar `Tabs` no padrão do design system.
2. Estilo das abas: linha inferior em `carmine-core` na aba ativa, texto inativo em `titanium-muted`, hover `ice-white`, contagem opcional em badge mono (`Retalhos (128)`).
3. Estado de cada aba na URL (query param ou segmento de rota — ex.: `/estoque?tab=retalhos`) para deep-link e retorno do breadcrumb.
4. Cada aba mantém seu próprio estado de loading/empty — uma aba vazia não afeta as demais.
5. **Proibido** rolagem infinita empilhando seções soltas: se a tela cresceu, ela vira abas.

---

## 8. CRUD completo — Definition of Done

Toda entidade com CRUD (produtos, fornecedores, clientes, depósitos, máquinas, usuários, retalhos, orçamentos...) só está pronta quando entrega **tudo** isto:

- [ ] **Listagem** com `DataTable` + `SearchFilterBar` + ordenação + paginação (25/50/100)
- [ ] **Novo** — `FormDrawer` com validação Zod inline e toast de sucesso
- [ ] **Editar** — mesmo drawer, pré-preenchido, título "Edição de ... - {identificador}"
- [ ] **Detalhe** — visualização somente-leitura (drawer ou página com breadcrumbs) com todos os campos técnicos formatados
- [ ] **Excluir** — `ConfirmDialog` explicitando a entidade e consequência; exclusão lógica quando houver histórico; toast de confirmação
- [ ] **Ações em linha** — coluna "Ações" com ícones do Material Symbols (visualizar, editar, excluir, ação de domínio) com tooltip
- [ ] **Estados completos** — loading (skeleton), empty (EmptyState com CTA), error (toast + retry), permissão negada (403 amigável)
- [ ] **Auditoria** — created_by/updated_by registrados; mudanças visíveis em `/admin/auditoria`
- [ ] **Permissões** — respeitando a matriz RBAC (quem vê/who edita por papel)

---

## 9. Acessibilidade e micro-interações (mínimo obrigatório)

- Focus visível em **todo** elemento interativo: ring `1px carmine-core`, sem blur/glow.
- Navegação por teclado funcional (tab order lógico, Enter envia, Esc fecha drawer/modal).
- Tooltips em ícones sem texto; `aria-label` em botões de ícone; contraste conforme tokens (ice-white sobre carbon-950).
- Transições curtas (150–200ms) apenas em cor/ borda/ opacidade — sem animações elaboradas que não estejam no protótipo.

---

## 10. Checklist final de tela (aplicar antes de considerar pronta)

- [ ] Fiel ao `screen.png` (comparação lado a lado feita)
- [ ] Nenhum elemento nativo (select/checkbox/dialog/alert)
- [ ] Só tokens do projeto (zero cor/fonte fora da paleta)
- [ ] Números em JetBrains Mono, descrições em Inter
- [ ] Toasts nos 4 tipos com copy pt-BR; zero `alert/confirm` nativo
- [ ] Breadcrumbs presentes e com identificador real
- [ ] Abas quando a tela é longa (>1.5 viewport / 2+ seções)
- [ ] CRUD completo (checklist da seção 8) quando aplicável
- [ ] 4 estados de interação + loading/empty/error
- [ ] Aprovado na matriz RBAC (visual para quem só lê, ações para quem edita)
