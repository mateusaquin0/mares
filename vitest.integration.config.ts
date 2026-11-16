import { existsSync, readFileSync } from "node:fs"
import { parse } from "dotenv"
import { defineConfig } from "vitest/config"

// Testes de INTEGRAÇÃO (Fase 2 do docs/ROADMAP_TESTES.md) — batem num Postgres real.
// Exigem DATABASE_URL apontando para um banco de teste com as migrations aplicadas.
// Rodam apenas via `npm run test:integration` (localmente, se houver banco) e no CI
// (job dedicado com serviço Postgres). NUNCA no `npm test` (unitários, sem banco).

// Os testes criam e apagam grupos, usuários e itens de catálogo. O `.env` da raiz aponta para
// produção, então o banco é escolhido aqui de forma explícita: SEMPRE o `.env.teste` (projeto
// Supabase de testes). A única exceção é o CI, que não tem esse arquivo e usa o Postgres local
// do próprio job. Qualquer outro destino aborta.
const TEST_ENV_FILE = ".env.teste"
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

function isLocal(url: string | undefined): boolean {
  if (!url) return false
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

function integrationEnv(): Record<string, string> {
  if (existsSync(TEST_ENV_FILE)) {
    const vars = parse(readFileSync(TEST_ENV_FILE))
    if (!vars.DATABASE_URL || vars.DATABASE_URL.includes("COLE_A_")) {
      throw new Error(`Preencha DATABASE_URL e DIRECT_URL em ${TEST_ENV_FILE} antes de rodar.`)
    }
    // Um `.env.teste` copiado do `.env` sem trocar o banco levaria os testes a produção.
    const prod = existsSync(".env") ? parse(readFileSync(".env")).DATABASE_URL : undefined
    if (prod && prod === vars.DATABASE_URL) {
      throw new Error(`${TEST_ENV_FILE} aponta para o mesmo banco do .env (produção). Abortado.`)
    }
    return vars
  }
  if (process.env.CI && isLocal(process.env.DATABASE_URL)) return {}
  throw new Error(
    `Testes de integração recusados: ${TEST_ENV_FILE} não encontrado. ` +
      "Eles apagam dados e só rodam contra o ambiente de testes — nunca contra produção.",
  )
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    env: integrationEnv(),
    // Sem paralelismo entre arquivos: compartilham o mesmo banco de teste.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
})
