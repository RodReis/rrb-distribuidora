/**
 * Resend e-mail helper (US-08 — convite de usuário).
 * Se RESEND_API_KEY não estiver configurada, retorna false e o admin
 * compartilha a credencial temporária manualmente.
 */
export async function sendInviteEmail(
  to: string,
  name: string,
  tempPassword: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MetalAgents <onboarding@resend.dev>",
        to: [to],
        subject: "MetalAgents — Convite de acesso à plataforma",
        html: `
          <div style="font-family: Arial, sans-serif; background:#0B0D11; color:#F8FAFC; padding:32px; border-radius:8px;">
            <h2 style="color:#DC2626;">MetalAgents — GF Industrial Analytics Terminal</h2>
            <p>Olá, <strong>${name}</strong>.</p>
            <p>Você foi convidado a acessar a plataforma MetalAgents.</p>
            <p>Seu acesso temporário:</p>
            <p style="font-family: monospace; background:#11141A; border:1px solid #222733; padding:12px; border-radius:4px;">
              Usuário: ${to}<br/>
              Senha temporária: <strong>${tempPassword}</strong>
            </p>
            <p style="color:#94A3B8; font-size:12px;">
              Recomendamos alterar sua senha no primeiro acesso. Em caso de dúvidas, contate o administrador.
            </p>
          </div>
        `,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
