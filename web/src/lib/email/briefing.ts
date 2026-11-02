const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendBriefingEmail(
  recipients: string[],
  briefingDate: string,
  summaryText: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || recipients.length === 0) return false;

  const body = escape(summaryText).replace(/\n/g, "<br/>");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "MetalAgents <onboarding@resend.dev>",
        to: recipients,
        subject: `MetalAgents · Briefing matinal ${briefingDate}`,
        html: `<div style="font-family:Arial,sans-serif;background:#0B0D11;color:#F8FAFC;padding:24px;max-width:640px;margin:0 auto;">
          <h2 style="color:#DC2626;margin:0 0 16px;">Briefing matinal · ${escape(briefingDate)}</h2>
          <div style="font-size:14px;line-height:1.5;">${body}</div>
          <p style="color:#94A3B8;font-size:12px;margin-top:24px;">Apoio à decisão. A decisão final é sempre humana. · MetalAgents</p>
        </div>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
