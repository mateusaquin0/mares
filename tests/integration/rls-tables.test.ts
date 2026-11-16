import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"

// Isolamento no nível do BANCO para as demais tabelas com dado de pesquisa ou de pessoa.
// rls.test.ts cobre "Animal"; aqui a mesma pergunta — "o membro da org A lê a linha da org B?"
// — é feita a Research, Sample, Analysis, Membership e User. É a segunda barreira: vale para
// quem lê direto pela Data API, caso a camada de aplicação falhe.
//
// Mesma mecânica de rls.test.ts: o Prisma conecta como superusuário e IGNORA o RLS, então cada
// leitura roda numa transação com o role `authenticated` e `request.jwt.claim.sub` definido.

const tag = randomUUID().slice(0, 8)
// Ids de User precisam ser UUID: auth.uid() faz ::uuid.
const userA = randomUUID()
const userB = randomUUID()

type Side = { org: string; research: string; animal: string; sample: string; analysis: string }
let a: Side
let b: Side
let organId: string
let groupId: string
let pathogenId: string
let examTypeId: string

// Só nomes fixos de tabela entram aqui (nunca entrada externa).
type Table = "Research" | "Sample" | "Analysis"

/** Ids da tabela visíveis ao usuário, com o RLS aplicado. */
async function visibleIds(userId: string, table: Table | "User"): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`SELECT set_config('request.jwt.claim.sub', $1, true)`, userId)
    await tx.$queryRawUnsafe(
      `SELECT set_config('request.jwt.claim.role', $1, true)`,
      "authenticated",
    )
    await tx.$executeRawUnsafe(`SET LOCAL ROLE authenticated`)
    const rows = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "${table}"`)
    return rows.map((r) => r.id)
  })
}

/** Organizações cujos vínculos (Membership) o usuário consegue ler. */
async function visibleMembershipOrgs(userId: string): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`SELECT set_config('request.jwt.claim.sub', $1, true)`, userId)
    await tx.$queryRawUnsafe(
      `SELECT set_config('request.jwt.claim.role', $1, true)`,
      "authenticated",
    )
    await tx.$executeRawUnsafe(`SET LOCAL ROLE authenticated`)
    const rows = await tx.$queryRawUnsafe<{ orgId: string }[]>(`SELECT "orgId" FROM "Membership"`)
    return rows.map((r) => r.orgId)
  })
}

/** Uma organização com pesquisa PRIVADA, indivíduo privado, amostra e resultado. */
async function createSide(label: string, userId: string): Promise<Side> {
  const org = (
    await prisma.organization.create({
      data: { name: `RLS tabelas ${label} ${tag}` },
      select: { id: true },
    })
  ).id
  await prisma.user.create({
    data: { id: userId, email: `rlst-${userId}@test.local`, name: `RLS ${label}` },
  })
  await prisma.membership.create({ data: { userId, orgId: org } })
  const research = (
    await prisma.research.create({
      data: { name: `RLS tabelas pesquisa ${label} ${tag}`, orgId: org, isPublic: false },
      select: { id: true },
    })
  ).id
  const animal = (
    await prisma.animal.create({
      data: { researchId: research, orgId: org, isPublic: false },
      select: { id: true },
    })
  ).id
  const sample = (
    await prisma.sample.create({
      data: {
        animalId: animal,
        researchId: research,
        organId,
        orgId: org,
        identification: `RLST-${label}-${tag}`,
        sampleType: "Tecido",
      },
      select: { id: true },
    })
  ).id
  const analysis = (
    await prisma.analysis.create({
      data: { sampleId: sample, pathogenId, examTypeId, result: "POSITIVO" },
      select: { id: true },
    })
  ).id
  return { org, research, animal, sample, analysis }
}

beforeAll(async () => {
  // Catálogo próprio do teste (nome = chave): não depende do seed nem colide com ele.
  groupId = (
    await prisma.pathogenGroup.create({
      data: { key: `grp_rlst_${tag}`, name: { pt: `grp_rlst_${tag}`, en: `grp_rlst_${tag}` } },
      select: { id: true },
    })
  ).id
  organId = (
    await prisma.organ.create({
      data: {
        key: `organ_rlst_${tag}`,
        name: { pt: `organ_rlst_${tag}`, en: `organ_rlst_${tag}` },
      },
      select: { id: true },
    })
  ).id
  pathogenId = (
    await prisma.pathogen.create({
      data: { key: `pathogen_rlst_${tag}`, groupId, scientificName: `Pathogenus rlst${tag}` },
      select: { id: true },
    })
  ).id
  examTypeId = (
    await prisma.examType.create({
      data: { key: `exam_rlst_${tag}`, name: { pt: `exam_rlst_${tag}`, en: `exam_rlst_${tag}` } },
      select: { id: true },
    })
  ).id
  a = await createSide("A", userA)
  b = await createSide("B", userB)
})

afterAll(async () => {
  const ids = (xs: (string | undefined)[]) => xs.filter((x): x is string => !!x)
  const orgIds = ids([a?.org, b?.org])
  await prisma.analysis.deleteMany({ where: { sample: { orgId: { in: orgIds } } } })
  await prisma.sample.deleteMany({ where: { orgId: { in: orgIds } } })
  await prisma.animal.deleteMany({ where: { orgId: { in: orgIds } } })
  await prisma.research.deleteMany({ where: { orgId: { in: orgIds } } })
  await prisma.membership.deleteMany({ where: { userId: { in: [userA, userB] } } })
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } })
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
  await prisma.pathogen.deleteMany({ where: { id: { in: ids([pathogenId]) } } })
  await prisma.pathogenGroup.deleteMany({ where: { id: { in: ids([groupId]) } } })
  await prisma.examType.deleteMany({ where: { id: { in: ids([examTypeId]) } } })
  await prisma.organ.deleteMany({ where: { id: { in: ids([organId]) } } })
  await prisma.$disconnect()
})

describe("RLS — isolamento entre organizações nas tabelas de pesquisa", () => {
  const cases: { table: Table; key: "research" | "sample" | "analysis" }[] = [
    { table: "Research", key: "research" },
    { table: "Sample", key: "sample" },
    { table: "Analysis", key: "analysis" },
  ]

  it.each(cases)("$table: o membro lê a linha da própria organização", async ({ table, key }) => {
    // Asserção POSITIVA: sem ela, um setup quebrado (RLS negando tudo) passaria como isolamento.
    expect(await visibleIds(userA, table)).toContain(a[key])
  })

  it.each(cases)("$table: o membro NÃO lê a linha privada de outra organização", async (c) => {
    expect(await visibleIds(userA, c.table)).not.toContain(b[c.key])
    expect(await visibleIds(userB, c.table)).not.toContain(a[c.key])
  })
})

describe("RLS — isolamento entre organizações nos dados de pessoas", () => {
  it("o usuário lê os vínculos da própria organização e não os de outra", async () => {
    const orgs = await visibleMembershipOrgs(userA)
    expect(orgs).toContain(a.org)
    expect(orgs).not.toContain(b.org)
  })

  it("o usuário lê o próprio cadastro e não o de quem é de outra organização", async () => {
    const users = await visibleIds(userA, "User")
    expect(users).toContain(userA)
    expect(users).not.toContain(userB)
  })
})
