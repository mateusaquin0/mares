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
      reporter: ["text", "html"],
    },
  },
})
