import { defineConfig } from "vitest/config"

// Testes de INTEGRAÇÃO (Fase 2 do docs/ROADMAP_TESTES.md) — batem num Postgres real.
// Exigem DATABASE_URL apontando para um banco de teste com as migrations aplicadas.
// Rodam apenas via `npm run test:integration` (localmente, se houver banco) e no CI
// (job dedicado com serviço Postgres). NUNCA no `npm test` (unitários, sem banco).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Sem paralelismo entre arquivos: compartilham o mesmo banco de teste.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
})
