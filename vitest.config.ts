import { defineConfig } from "vitest/config"

// Configuração dos testes unitários (Fase 1 do docs/ROADMAP_TESTES.md).
// Ambiente `node`: os alvos são funções puras (schemas Zod, parsers, utilitários) sem DOM.
// O alias `@/` → `src/` é resolvido nativamente pelo Vite a partir do tsconfig.
// Os testes de INTEGRAÇÃO (tests/integration, precisam de banco) usam config própria
// — ver vitest.integration.config.ts — e NÃO rodam aqui.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/schemas/**", "src/lib/**"],
      // Testes e seus utilitários (ex.: o Prisma simulado) não são código de produção.
      exclude: ["**/__tests__/**"],
      reporter: ["text", "html"],
      // Piso (ratchet), não meta: fixa o nível atual para que a cobertura não CAIA
      // silenciosamente. Conforme novos testes entrarem, suba estes números.
      thresholds: {
        statements: 97,
        branches: 94,
        functions: 98,
        lines: 98,
      },
    },
  },
})
