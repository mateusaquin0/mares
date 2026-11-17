import { cleanup, connect, leftovers } from "./helpers/db"
import { resolveE2eEnv } from "./helpers/env"

// Confere o que a suíte E2E ainda tem no ambiente de testes (banco, Auth e Storage):
//   npx tsx tests/e2e/leftovers.ts           → só relata; sai com código 1 se houver sobra
//   npx tsx tests/e2e/leftovers.ts --clean   → remove a sobra (mesmos filtros do teardown)
// O destino passa pela mesma trava dos testes: só o `.env.teste`.
async function main() {
  const db = connect(resolveE2eEnv().vars)
  try {
    if (process.argv.includes("--clean")) await cleanup(db)
    const counts = await leftovers(db)
    console.log(JSON.stringify(counts, null, 2))
    if (Object.values(counts).some((n) => n > 0)) process.exitCode = 1
  } finally {
    await db.prisma.$disconnect()
  }
}

void main()
