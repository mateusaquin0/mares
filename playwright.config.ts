import { defineConfig, devices } from "@playwright/test"

// Testes E2E (Fase 3 do docs/ROADMAP_TESTES.md). Sobem o app real e dirigem o navegador.
// O smoke público (landing + mapa) roda sem login. Fluxos autenticados ficam como
// esqueleto (test.skip) até haver um projeto Supabase de teste — ver ROADMAP_TESTES.md §3.
const PORT = 3100
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Sobe o Next e espera responder. Em dev localmente reaproveita um servidor já rodando.
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
