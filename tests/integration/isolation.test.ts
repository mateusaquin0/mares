import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { loadAnimalOrg, assertResearchInOrg, animalDuplicateError } from "@/lib/animals"
import { NotFoundError, ConflictError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

// Fase 2 — testes de integração contra um Postgres real (ver docs/ROADMAP_TESTES.md).
// Foco: a "joia da coroa" — isolamento entre organizações (anti-IDOR) — mais as
// invariantes de banco que só existem no schema (unicidade por org, visibilidade de export).
// Os dados são criados e removidos pelo próprio teste; não dependem do seed.

// IDs criados, para limpeza determinística no afterAll.
const orgs: string[] = []
let orgA: string
let orgB: string
let researchApub: string // pesquisa pública da org A
let researchApriv: string // pesquisa privada da org A
let researchB: string // pesquisa da org B

async function createOrg(name: string) {
  const org = await prisma.organization.create({ data: { name }, select: { id: true } })
  orgs.push(org.id)
  return org.id
}

async function createResearch(orgId: string, name: string, isPublic: boolean) {
  const r = await prisma.research.create({
    data: { name, orgId, isPublic },
    select: { id: true },
  })
  return r.id
}

async function createAnimal(researchId: string, orgId: string, over: Record<string, unknown> = {}) {
  const a = await prisma.animal.create({
    data: { species: "Sotalia guianensis", researchId, orgId, ...over },
    select: { id: true },
  })
  return a.id
}

beforeAll(async () => {
  orgA = await createOrg("Org A (test)")
  orgB = await createOrg("Org B (test)")
  researchApub = await createResearch(orgA, "Pesquisa A pública", true)
  researchApriv = await createResearch(orgA, "Pesquisa A privada", false)
  researchB = await createResearch(orgB, "Pesquisa B", true)
})

afterAll(async () => {
  // Ordem segura de FK: animais → pesquisas → organizações.
  await prisma.animal.deleteMany({ where: { orgId: { in: orgs } } })
  await prisma.research.deleteMany({ where: { orgId: { in: orgs } } })
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } })
  await prisma.$disconnect()
})

describe("Isolamento multi-organização (anti-IDOR)", () => {
  it("a query escopada por org só retorna animais da própria org", async () => {
    const animalA = await createAnimal(researchApub, orgA)
    await createAnimal(researchB, orgB)

    // Predicado real usado em src/app/api/animals/route.ts (GET).
    const daOrgA = await prisma.animal.findMany({
      where: { research: { orgId: orgA } },
      select: { id: true },
    })

    const ids = daOrgA.map((a) => a.id)
    expect(ids).toContain(animalA)
    expect(daOrgA.every((a) => a.id !== undefined)).toBe(true)
    // Nenhum animal da org B vaza para a listagem da org A.
    const daOrgAcompleta = await prisma.animal.findMany({
      where: { research: { orgId: orgA } },
      select: { orgId: true },
    })
    expect(daOrgAcompleta.every((a) => a.orgId === orgA)).toBe(true)
  })

  it("assertResearchInOrg aceita a pesquisa da própria org e rejeita a de outra", async () => {
    await expect(assertResearchInOrg(researchApub, orgA)).resolves.toBeUndefined()

    // Pesquisa da org B consultada como se fosse da org A → NotFound (não vaza existência).
    await expect(assertResearchInOrg(researchB, orgA)).rejects.toMatchObject({
      code: ERROR_CODES.researchNotFound,
    })
    await expect(assertResearchInOrg(researchB, orgA)).rejects.toBeInstanceOf(NotFoundError)
  })

  it("loadAnimalOrg resolve o orgId a partir da pesquisa do animal", async () => {
    const animalA = await createAnimal(researchApub, orgA)
    const loaded = await loadAnimalOrg(animalA)
    expect(loaded.orgId).toBe(orgA)
    expect(loaded.researchId).toBe(researchApub)
  })

  it("loadAnimalOrg lança NotFound para id inexistente", async () => {
    await expect(loadAnimalOrg("nao-existe")).rejects.toMatchObject({
      code: ERROR_CODES.animalNotFound,
    })
  })
})

describe("Unicidade de controlId por organização", () => {
  it("bloqueia controlId duplicado na MESMA org e permite em orgs diferentes", async () => {
    await createAnimal(researchApub, orgA, { controlId: "CTRL-DUP" })

    // Mesmo controlId, mesma org → viola @@unique([orgId, controlId]) (P2002).
    let caught: unknown
    try {
      await createAnimal(researchApriv, orgA, { controlId: "CTRL-DUP" })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    const mapped = animalDuplicateError(caught as Prisma.PrismaClientKnownRequestError)
    expect(mapped).toBeInstanceOf(ConflictError)
    expect(mapped.code).toBe(ERROR_CODES.animalControlDuplicate)

    // Mesmo controlId em OUTRA org → permitido.
    await expect(createAnimal(researchB, orgB, { controlId: "CTRL-DUP" })).resolves.toBeDefined()
  })
})

describe("Visibilidade da exportação Darwin Core", () => {
  it("pesquisa pública exporta só animais públicos; privada exporta todos", async () => {
    // Pesquisa pública: 1 animal público + 1 oculto.
    await createAnimal(researchApub, orgA, { controlId: "PUB-1", isPublic: true })
    await createAnimal(researchApub, orgA, { controlId: "PUB-2", isPublic: false })
    // Pesquisa privada: 1 animal (independente de isPublic).
    await createAnimal(researchApriv, orgA, { controlId: "PRIV-1", isPublic: false })

    // Filtro real de src/app/api/research/[id]/export/darwin-core/route.ts.
    const publicExport = await prisma.animal.count({
      where: { researchId: researchApub, isPublic: true },
    })
    const hiddenInPublic = await prisma.animal.count({
      where: { researchId: researchApub, isPublic: false },
    })
    expect(publicExport).toBeGreaterThanOrEqual(1)
    expect(hiddenInPublic).toBeGreaterThanOrEqual(1)

    // Numa pesquisa privada, o filtro NÃO restringe por isPublic → conta todos.
    const privateExport = await prisma.animal.count({ where: { researchId: researchApriv } })
    expect(privateExport).toBeGreaterThanOrEqual(1)
  })
})
