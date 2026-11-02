import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    // Os testes de integração compartilham o mesmo Postgres: em paralelo, um conta o que o outro cria.
    fileParallelism: !process.env.RUN_DB_TESTS,
  },
});
