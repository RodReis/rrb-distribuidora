import "dotenv/config";
import cron from "node-cron";
import {
  DEFAULT_METALS_CRON,
  MARKET_TIMEZONE,
  PTAX_CRONS,
  getMetalsCron,
} from "../lib/market/schedule";

const APP_URL = (process.env.APP_INTERNAL_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;

if (!SECRET) {
  console.error("[market-worker] CRON_SECRET não configurado. Encerrando.");
  process.exit(1);
}

let metalsCron = getMetalsCron();
if (!cron.validate(metalsCron)) {
  console.error(
    `[market-worker] METALS_CRON inválido ("${metalsCron}"). Usando o padrão ${DEFAULT_METALS_CRON}.`
  );
  metalsCron = DEFAULT_METALS_CRON;
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
for (const expr of PTAX_CRONS) {
  cron.schedule(expr, () => void trigger("ingest-ptax"), { timezone: MARKET_TIMEZONE });
}
cron.schedule(metalsCron, () => void trigger("ingest-metals"), { timezone: MARKET_TIMEZONE });

console.log(
  `[market-worker] agendado (${MARKET_TIMEZONE}): PTAX ${PTAX_CRONS.join(" | ")}; metais "${metalsCron}".`
);
