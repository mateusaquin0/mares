import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { parse } from "dotenv"

// Ambiente da suíte E2E. O `.env` da raiz aponta para PRODUÇÃO, então o destino é escolhido
// aqui de forma explícita, com a mesma regra dos testes de integração
// (vitest.integration.config.ts): SEMPRE o `.env.teste` (projeto Supabase de testes). A única
// exceção é o CI, que não tem esse arquivo e sobe o app contra o Postgres local do próprio job
// — lá não existe Auth, e por isso só a fumaça pública roda. Qualquer outro destino aborta.

export const ROOT = path.resolve(__dirname, "..", "..", "..")
export const PORT = 3100
export const BASE_URL = `http://localhost:${PORT}`

const TEST_ENV_FILE = ".env.teste"
const PROD_ENV_FILE = ".env"
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

// Variáveis que decidem ONDE o app lê e grava. Nenhuma pode coincidir com a de produção.
const DESTINATION_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const

export type E2eEnv = {
  // Há projeto Supabase de testes: os fluxos autenticados podem rodar.
  auth: boolean
  // Variáveis entregues ao servidor Next da suíte (vazio no CI: lá vêm do próprio job).
  vars: Record<string, string>
}

function isLocal(url: string | undefined): boolean {
  if (!url) return false
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

function readEnvFile(name: string): Record<string, string> | null {
  const file = path.join(ROOT, name)
  return existsSync(file) ? parse(readFileSync(file)) : null
}

// As mensagens citam só o NOME da variável: os valores são segredos e não vão para o log.
export function resolveE2eEnv(): E2eEnv {
  const vars = readEnvFile(TEST_ENV_FILE)
  if (!vars) {
    if (process.env.CI && isLocal(process.env.DATABASE_URL)) return { auth: false, vars: {} }
    throw new Error(
      `Testes E2E recusados: ${TEST_ENV_FILE} não encontrado. ` +
        "Eles criam e apagam dados e só rodam contra o ambiente de testes — nunca contra produção.",
    )
  }

  for (const key of DESTINATION_KEYS) {
    const value = vars[key]
    if (!value || value.includes("COLE_A_")) {
      throw new Error(`Testes E2E recusados: preencha ${key} em ${TEST_ENV_FILE} antes de rodar.`)
    }
  }

  // Um `.env.teste` copiado do `.env` sem trocar o destino levaria a suíte a produção.
  const prod = readEnvFile(PROD_ENV_FILE)
  if (prod) {
    for (const key of DESTINATION_KEYS) {
      if (prod[key] && prod[key] === vars[key]) {
        throw new Error(
          `Testes E2E recusados: ${key} em ${TEST_ENV_FILE} é igual ao do ${PROD_ENV_FILE} (produção).`,
        )
      }
    }
  }

  // Segunda barreira: o servidor da suíte roda numa cópia do app que não tem `.env`, mas uma
  // chave de produção ainda poderia chegar herdada do terminal. Toda chave do `.env` que o
  // `.env.teste` não define entra vazia, para nunca valer o valor de produção.
  const blanks: Record<string, string> = {}
  for (const key of Object.keys(prod ?? {})) {
    if (!(key in vars)) blanks[key] = ""
  }

  return {
    // E2E_PUBLIC_ONLY=1 reproduz localmente o recorte do CI (só a fumaça pública).
    auth: !process.env.E2E_PUBLIC_ONLY,
    vars: { ...blanks, ...vars, NEXT_PUBLIC_APP_URL: BASE_URL },
  }
}
