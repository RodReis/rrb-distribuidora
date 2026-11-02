export async function sendMarketAlertEmail(
  to: string,
  title: string,
  message: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "MetalAgents <onboarding@resend.dev>",
        to: [to],
        subject: `MetalAgents · ${title}`,
        html: `<div style="font-family:Arial,sans-serif;background:#0B0D11;color:#F8FAFC;padding:32px;border-radius:8px;">
          <h2 style="color:#DC2626;margin:0 0 12px;">${escape(title)}</h2>
          <p style="margin:0;">${escape(message)}</p>
          <p style="color:#94A3B8;font-size:12px;margin-top:24px;">Alerta de Inteligência de Mercado · MetalAgents</p>
        </div>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
