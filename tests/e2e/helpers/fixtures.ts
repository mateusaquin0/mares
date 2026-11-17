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
//
// Os grupos A e B são os dos testes de permissão e isolamento. As telas ganham um grupo à
// parte ("de trabalho", contas `work*`), para que o que elas cadastram, editam e apagam não
// mude o que aqueles testes contam. Contas que o próprio teste altera (papel, nome, senha,
// exclusão) são descartáveis e de uso de um arquivo só.
export type RoleKey =
  | "orgAdmin"
  | "researcher"
  | "otherOrg"
  | "systemAdmin"
  | "signIn"
  | "workAdmin"
  | "workResearcher"
  | "workMember"
  | "membersAdmin"
  | "memberPromote"
  | "memberRemove"
  | "multiOrg"
  | "profileEdit"
  | "profileDelete"
export const SESSION_ROLES = [
  "orgAdmin",
  "researcher",
  "otherOrg",
  "systemAdmin",
  "workAdmin",
  "workResearcher",
  "membersAdmin",
  "multiOrg",
] as const

export type E2eUser = { id: string; email: string; name: string }
type Named = { id: string; name: string }
type Labeled = { id: string; label: string }
export type E2eAnimal = { id: string; controlId: string; species: string }

export type E2eFixtures = {
  runId: string
  prefix: string
  password: string
  users: Record<RoleKey, E2eUser>
  orgs: {
    a: Named
    b: Named
    work: Named
    members: Named
    multiC: Named
    multiD: Named
    profile: Named
  }
  catalog: {
    organ: Labeled
    pathogen: Labeled
    examType: Labeled
    // Segundo material, para protocolos com mais de uma entrada.
    organ2: Labeled
    // Patógeno de nível acima de espécie (família): é o rastreio que pede confirmação.
    pathogenBroad: Labeled
    // Espécie da mesma família, oferecida na confirmação por sequenciamento.
    pathogenConfirm: Labeled
    // Exame com medida quantitativa (Ct) na grade de análises.
    examMeasured: Labeled & { measure: string }
    systems: [Labeled, Labeled]
  }
  research: { shared: Named; restricted: Named; publicMap: Named; orgB: Named }
  animals: {
    shared: E2eAnimal
    restricted: E2eAnimal
    mapPublic: E2eAnimal
    mapHidden: E2eAnimal
    orgB: E2eAnimal
  }
  // Grupo de trabalho: uma pesquisa por área de tela, com o conteúdo que cada arquivo espera.
  work: {
    clinical: {
      research: Named
      necropsy: E2eAnimal
      biometry: E2eAnimal
      biometrySimba: E2eAnimal
      media: E2eAnimal
    }
    list: {
      research: Named
      researchB: Named
      // `paged` (mais de uma página no tamanho padrão) e `removable` (11: no tamanho 10 a
      // última página tem um item só) são localizados pela busca do prefixo do ID de controle.
      paged: { prefix: string; count: number; inResearchB: number; withSamples: number }
      removable: { prefix: string; count: number }
      speciesAlfa: { name: string; count: number }
      speciesBeta: { name: string; count: number }
    }
    edit: {
      research: Named
      first: E2eAnimal & { municipality: string }
      second: E2eAnimal & { municipality: string }
    }
    samples: { research: Named; animal: E2eAnimal; editable: string; locked: string }
    analyses: { research: Named; animal: E2eAnimal; sample: string }
    results: {
      research: Named
      noAnimals: Named
      positive: E2eAnimal
      negative: E2eAnimal
      untested: E2eAnimal
    }
    manage: { research: Named; empty: Named }
    sharing: {
      origin: Named
      target: Named
      accept: E2eAnimal
      cancel: E2eAnimal
      reject: E2eAnimal
    }
  }
  multi: { c: { research: Named; animal: E2eAnimal }; d: { research: Named; animal: E2eAnimal } }
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
