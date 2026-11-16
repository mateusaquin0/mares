import { defineConfig, devices } from "@playwright/test"

import { VIEWPORT } from "./tests/e2e/helpers/app"
import { BASE_URL, resolveE2eEnv } from "./tests/e2e/helpers/env"

// Testes E2E (Fase 3 do docs/ROADMAP_TESTES.md). Sobem o app real e dirigem o navegador.
//
// Destino: o `.env` da raiz é PRODUÇÃO, então a suíte nunca sobe o app com ele. Localmente o
// servidor roda com o `.env.teste` (projeto Supabase de testes) e a suíte aborta, já aqui, se
// esse arquivo faltar ou apontar para o mesmo destino de produção — ver tests/e2e/helpers/env.ts.
//
// Recorte: com o ambiente de testes disponível rodam os fluxos autenticados (login, pesquisa,
// animal, resultados, permissões, isolamento, mapa, exportação). No CI não há Supabase Auth:
// roda só a fumaça pública, e os demais são pulados de forma explícita (E2E_AUTH ausente).
const e2e = resolveE2eEnv()
if (e2e.auth) process.env.E2E_AUTH = "1"
else delete process.env.E2E_AUTH

export default defineConfig({
  testDir: "./tests/e2e",
  // Os testes compartilham o mesmo grupo de pesquisa no banco de testes (e um `next dev` que
  // compila sob demanda): um arquivo por vez, na ordem, para o resultado ser determinístico.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    navigationTimeout: 90_000,
    actionTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: VIEWPORT } }],
  // Sobe o Next da suíte (a partir de uma cópia do app, na porta 3100) e espera responder.
  // Localmente reaproveita um servidor já de pé NESSA porta (`npm run test:e2e:server`); o
  // global-setup confere que ele está ligado ao ambiente de testes antes de criar qualquer dado.
  webServer: {
    command: "npx tsx tests/e2e/server.ts",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
