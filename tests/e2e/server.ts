import { spawn } from "node:child_process"
import path from "node:path"

import { APP_COPY, syncAppCopy } from "./helpers/app-copy"
import { PORT, ROOT, resolveE2eEnv } from "./helpers/env"

// Servidor Next da suíte E2E (webServer do playwright.config.ts; também `npm run test:e2e:server`
// para deixá-lo de pé entre execuções). Sobe a partir da cópia do app, com as variáveis do
// ambiente de testes — ver helpers/app-copy.ts e helpers/env.ts.

// A trava roda de novo AQUI, no ponto em que o destino é de fato usado: quem chamar este
// arquivo direto, sem passar pelo Playwright, cai na mesma recusa.
const { vars } = resolveE2eEnv()

syncAppCopy()

const child = spawn(
  process.execPath,
  [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(PORT)],
  { cwd: APP_COPY, stdio: "inherit", env: { ...process.env, ...vars } },
)

child.on("exit", (code) => process.exit(code ?? 0))
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal))
}
