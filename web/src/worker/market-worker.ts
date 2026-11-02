import "dotenv/config";
import cron from "node-cron";

const APP_URL = (process.env.APP_INTERNAL_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;
const TZ = "America/Sao_Paulo";

if (!SECRET) {
  console.error("[market-worker] CRON_SECRET não configurado. Encerrando.");
  process.exit(1);
}

async function trigger(job: "ingest-ptax" | "ingest-metals") {
  const startedAt = new Date().toISOString();
  try {
    const res = await fetch(`${APP_URL}/api/internal/jobs/${job}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
      signal: AbortSignal.timeout(90_000),
    });
    const body = await res.text();
    console.log(`[market-worker] ${startedAt} ${job} -> HTTP ${res.status} ${body.slice(0, 500)}`);
  } catch (err) {
    console.error(
      `[market-worker] ${startedAt} ${job} falhou:`,
      err instanceof Error ? err.message : err
    );
  }
}

// PTAX: boletim das 13h15 e fechamento oficial às 18h00, dias úteis.
cron.schedule("15 13 * * 1-5", () => void trigger("ingest-ptax"), { timezone: TZ });
cron.schedule("0 18 * * 1-5", () => void trigger("ingest-ptax"), { timezone: TZ });
// Metais: de hora em hora no pregão (08h–18h), dias úteis.
cron.schedule("0 8-18 * * 1-5", () => void trigger("ingest-metals"), { timezone: TZ });

console.log("[market-worker] agendado (America/Sao_Paulo): PTAX 13:15 e 18:00; metais 08h–18h/h.");
