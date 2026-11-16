import { existsSync, rmSync } from "node:fs"

import { cleanup, connect } from "./helpers/db"
import { resolveE2eEnv } from "./helpers/env"
import { AUTH_DIR, fixturesPath, loadFixtures } from "./helpers/fixtures"

// Remove o que ESTA execução criou (dados, usuários do Auth, sessões salvas). O filtro é o
// prefixo da execução: o banco de testes guarda dados cadastrados à mão que não são da suíte.
export default async function globalTeardown() {
  const env = resolveE2eEnv()
  if (!env.auth || !existsSync(fixturesPath())) return

  const { runId } = loadFixtures()
  const db = connect(env.vars)
  try {
    await cleanup(db, runId)
  } finally {
    await db.prisma.$disconnect()
    rmSync(AUTH_DIR, { recursive: true, force: true })
  }
}
