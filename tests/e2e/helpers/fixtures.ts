import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

// Dados base da execução, gravados pelo global-setup e lidos pelos testes. A pasta guarda
// também as sessões salvas (storageState) e a senha sorteada dos usuários de teste: fica fora
// do git e é apagada no teardown.
export const AUTH_DIR = path.resolve(__dirname, "..", ".auth")
const FIXTURES_FILE = path.join(AUTH_DIR, "fixtures.json")

// Os testes autenticados só rodam quando a suíte sobe com o `.env.teste` (o playwright.config.ts
// define E2E_AUTH nesse caso). No CI não há Supabase Auth, e eles são pulados.
export const AUTH_ENABLED = !!process.env.E2E_AUTH
export const AUTH_SKIP_REASON =
  "requer o projeto Supabase de testes (.env.teste) — no CI só a fumaça pública roda"

// Papéis com sessão salva. `signIn` é a conta dos testes de login/logout: sair encerra as
// sessões do usuário no Auth, e por isso ela não pode ser uma das contas compartilhadas.
export type RoleKey = "orgAdmin" | "researcher" | "otherOrg" | "systemAdmin" | "signIn"
export const SESSION_ROLES = ["orgAdmin", "researcher", "otherOrg", "systemAdmin"] as const

export type E2eUser = { id: string; email: string; name: string }
type Named = { id: string; name: string }
type Labeled = { id: string; label: string }
export type E2eAnimal = { id: string; controlId: string; species: string }

export type E2eFixtures = {
  runId: string
  prefix: string
  password: string
  users: Record<RoleKey, E2eUser>
  orgs: { a: Named; b: Named }
  catalog: { organ: Labeled; pathogen: Labeled; examType: Labeled }
  research: { shared: Named; restricted: Named; publicMap: Named; orgB: Named }
  animals: {
    shared: E2eAnimal
    restricted: E2eAnimal
    mapPublic: E2eAnimal
    mapHidden: E2eAnimal
    orgB: E2eAnimal
  }
}

export function storageStatePath(role: RoleKey): string {
  return path.join(AUTH_DIR, `${role}.json`)
}

export function fixturesPath(): string {
  return FIXTURES_FILE
}

let cached: E2eFixtures | undefined

export function loadFixtures(): E2eFixtures {
  if (cached) return cached
  if (!existsSync(FIXTURES_FILE)) {
    throw new Error("Fixtures da suíte E2E ausentes: o global-setup não rodou até o fim.")
  }
  cached = JSON.parse(readFileSync(FIXTURES_FILE, "utf8")) as E2eFixtures
  return cached
}
