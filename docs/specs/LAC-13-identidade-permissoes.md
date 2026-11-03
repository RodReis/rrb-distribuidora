# SPEC LAC-13 — Identidade, recuperação de conta e permissões de agente

**Projeto:** MetalAgents · **Versão:** 1.0 · **Data:** 03/11/2026  
**Status:** proposta de backlog, não implementada · **Dependências:** M0, M4, LAC-01, LAC-12, LAC-15

## Objetivo

Fechar lacunas de autenticação/autorização: recuperação de senha, desativação efetiva, MFA, decisão de SSO/OAuth2 e política por papel para cada tool do copiloto.

## Regras de segurança

- Recuperação retorna resposta uniforme exista ou não a conta; token aleatório, armazenado como hash, expiração configurável, uso único, rate limit e revogação de sessões após redefinição. Entrega por canal verificado. Nunca envia senha atual.
- Desativar usuário impede novos logins e chamadas existentes na próxima validação; revoga sessões/refresh tokens, convites e tokens de recuperação. Reativação é ação auditada; preservar autoria histórica.
- MFA: política por usuário/papel ainda precisa de decisão; a SPEC suporta TOTP e códigos de recuperação de uso único cifrados/hash, política de recuperação assistida e exigência em ações sensíveis. Sem método configurado, não marcar MFA como atendido.
- SSO/OAuth2: PRD o exige e M0 removeu SAML no recorte inicial. Protocolo, provedor e fase são decisão aberta. OAuth login não equivale por si só a SSO corporativo nem elimina MFA; mapping de identidade e vinculação de contas exigem regra aprovada.
- Tools do copiloto declaram contrato: `read/write`, capability, papéis, escopo tenant, campos acessíveis e risco. Deny-by-default; ferramentas M4 atuais são leitura. Nova ferramenta de escrita exige confirmação humana separada e SPEC de domínio.
- Autorização avaliada no servidor em cada execução, inclusive quando UI oculta ferramenta. Modelo não pode alterar papel, tenant ou capability por texto de prompt.

## Dados/rotas

`password_reset_tokens(user_id, token_hash, expires_at, consumed_at, created_at)`; `user_mfa(user_id, method, secret_ciphertext, enabled_at, recovery_hashes)`; `auth_events`; `agent_tool_permissions(role, tool_name, capability, allowed, version, approved_by)`.

Rotas `/api/auth/password/forgot|reset`, `/api/users/:id/deactivate|reactivate`, `/configuracoes/seguranca/mfa`, `/configuracoes/seguranca/sso`; ferramentas chamam `authorizeTool(user, tenant, tool, input)` antes da execução. Nunca confiar em role vindo do cliente.

## Aceite

- E-mail existente/inexistente recebe mesma resposta e forma temporal/rate-limit compatível.
- Token expirado, consumido ou de outro usuário não redefine senha; segundo uso falha.
- Desativação revoga sessões ativas e toda chamada protegida passa a 401/403 imediatamente.
- Tool sem regra, papel sem capability, tenant mismatch ou tool de escrita no perfil M4 atual é bloqueada e auditada.
- Prompt injection pedindo acesso a outro tenant/campo não altera identidade nem filtro; fixture de segurança cobre acesso direto à tool/API.
- MFA não é declarado ativo sem desafio validado e recuperação não permite contorno silencioso.
- Quando SSO estiver decidido, testes cobrem issuer/audience/state/nonce, vinculação e logout conforme provedor; até então item consta como decisão pendente, sem falso aceite.

## UI, limites e decisões

Tela de segurança com estado por usuário, setup MFA, sessões e papéis do copiloto. Fora: diretório corporativo provisionado (SCIM), passkeys e múltiplos IdPs. PI decide método obrigatório, papéis exigidos, provedor/protocolo/fluxo SSO, delegação de recuperação, tempo de sessão e lista inicial de tools. Desativação e reset seguro podem ser implementados sem esperar SSO.
