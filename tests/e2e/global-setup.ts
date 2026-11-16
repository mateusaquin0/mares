import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { chromium } from "@playwright/test"

import { VIEWPORT, fillLogin } from "./helpers/app"
import { syncAppCopy } from "./helpers/app-copy"
import { cleanup, connect, seed } from "./helpers/db"
import { BASE_URL, resolveE2eEnv } from "./helpers/env"
import { AUTH_DIR, SESSION_ROLES, fixturesPath, storageStatePath } from "./helpers/fixtures"

// Prepara os fluxos autenticados: confere o destino, cria os dados base no banco de testes e
// salva uma sessão por papel, para os testes não refazerem o login a cada caso.
export default async function globalSetup() {
  const env = resolveE2eEnv()
  if (!env.auth) return

  // Um servidor já de pé na porta da suíte é reaproveitado: garante que ele sirva o código atual.
  syncAppCopy()

  // O servidor na porta da suíte tem de estar ligado ao projeto Supabase de TESTES. A CSP que
  // o app envia cita a URL do Supabase em uso — é a forma de conferir isso de fora, e pega o
  // caso de alguém ter subido o app com o `.env` de produção nessa mesma porta.
  const expected = new URL(env.vars.NEXT_PUBLIC_SUPABASE_URL!).origin
  const res = await fetch(`${BASE_URL}/login`)
  if (!(res.headers.get("content-security-policy") ?? "").includes(expected)) {
    throw new Error(
      `Testes E2E recusados: o servidor em ${BASE_URL} não está ligado ao Supabase de testes. ` +
        "Encerre-o e deixe a suíte subir o próprio servidor.",
    )
  }

  const db = connect(env.vars)
  try {
    await cleanup(db)
    const fixtures = await seed(db)
    rmSync(AUTH_DIR, { recursive: true, force: true })
    mkdirSync(AUTH_DIR, { recursive: true })
    writeFileSync(fixturesPath(), JSON.stringify(fixtures, null, 2))

    const browser = await chromium.launch()
    try {
      for (const role of SESSION_ROLES) {
        const context = await browser.newContext({ baseURL: BASE_URL, viewport: VIEWPORT })
        const page = await context.newPage()
        await fillLogin(page, fixtures.users[role].email, fixtures.password)
        await page.waitForURL(/\/app\//, { timeout: 120_000 })
        await context.storageState({ path: storageStatePath(role) })
        await context.close()
      }
    } finally {
      await browser.close()
    }
  } catch (err) {
    // Setup pela metade não deixa dados para trás (o teardown não roda quando o setup falha).
    await cleanup(db).catch(() => {})
    rmSync(AUTH_DIR, { recursive: true, force: true })
    throw err
  } finally {
    await db.prisma.$disconnect()
  }
}
