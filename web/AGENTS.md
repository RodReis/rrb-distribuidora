<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Regras do projeto (decididas pelo PI)

- Idioma: documentação, specs, issues, commits e comunicação em PT-BR; código e identificadores em inglês; textos de interface em PT-BR.
- Privacidade e proteção de dados não pertencem ao contrato de produto nem ao PRD.
- Ninguém cria regra de produto.
- **Docker local compartilhado:**
- Não criar instância do projeto no Docker.
- Se o Docker estiver parado, subir a mesma instância.

## Skills do Code — execute

`superpowers:using-git-worktrees` → `superpowers:writing-plans` / `executing-plans` (a Slice do PRD **é** o design; `brainstorming` só quando cair num caso de bloqueio ou em `[FIX]` sem causa clara) → `superpowers:test-driven-development` em feature crítica (isolamento de tenant, decisão de acesso, idempotência) → `engineering:code-review` em toda tarefa → `gstack:qa` → `superpowers:finishing-a-development-branch` → `fechar-card.
Quando a tarefa tem UI: `frontend-design`(**obrigatória**, sem substituir a direção já fixada),`gstack:design-review`, `impeccable`(**obrigatória para acabamento/refino**) e smoke ao vivo com Playwright. Documentação de biblioteca:`context7`.

`gstack:*`, `fechar-card` e `impeccable` estão instalados globalmente na máquina do PI (Windows) — o Codex os usa normalmente lá. Em qualquer ambiente onde uma dessas skills não exista, isso não é desculpa para pular a disciplina que ela representa: aplicar o equivalente manual (revisão de design, acabamento visual, **comentário de encerramento com as três seções**) e registrar na PR.

skill global: C:\Users\rodri\.claude\skills
