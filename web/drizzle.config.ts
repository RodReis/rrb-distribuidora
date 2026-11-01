import { defineConfig } from "drizzle-kit";

const localUrl = "postgresql://metalagents:metalagents_secret@127.0.0.1:54320/metalagents";
const isDeployed = process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT_NAME;
const url = process.env.DATABASE_URL || (isDeployed ? "" : localUrl);

if (!url) {
  throw new Error(
    "DATABASE_URL não definida. No Railway, adicione o serviço Postgres e use DATABASE_URL=${{Postgres.DATABASE_URL}}."
  );
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
});
