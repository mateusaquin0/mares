import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/auth"
import { login, member, req as request } from "./helpers/route"

// Isolamento na camada de APLICAÇÃO, exercitado pelos PRÓPRIOS route handlers.
// O servidor acessa o banco pelo Prisma, que ignora o RLS — é nos handlers que mora a barreira
// principal. Aqui cada rota é chamada com a sessão de quem NÃO deveria alcançar o recurso:
//   • usuário de OUTRA organização;
//   • pesquisador da mesma organização, mas sem vínculo com a pesquisa (docs/PERMISSOES.md §1.1);
//   • visitante sem sessão.
// Cada bloco tem a asserção POSITIVA (o membro alcança), para que um setup quebrado — handler
// negando tudo — não passe como isolamento.
//
// Só a origem da sessão é substituída (ver helpers/route.ts); papéis, escopo e consultas são os reais.

import { GET as getAnimal } from "@/app/api/animals/[id]/route"
import { GET as getAnimalGrid } from "@/app/api/animals/[id]/grid/route"
import { GET as listAnimals } from "@/app/api/animals/route"
import { GET as getResearch } from "@/app/api/research/[id]/route"
import { GET as getResearchResults } from "@/app/api/research/[id]/results/route"
import { GET as exportDarwinCore } from "@/app/api/research/[id]/export/darwin-core/route"
import { PUT as putAnalysis } from "@/app/api/analyses/route"

const tag = randomUUID().slice(0, 8)

// Ids de User precisam ser UUID (é o id do Supabase Auth).
const memberA = randomUUID() // pesquisador da org A, VINCULADO à pesquisa
const outsiderA = randomUUID() // pesquisador da org A, SEM vínculo com a pesquisa
const adminA = randomUUID() // admin da org A
const memberB = randomUUID() // admin de OUTRA organização

let orgA: string
let orgB: string
let researchA: string
let animalA: string
let sampleA: string
let organId: string
let groupId: string
let pathogenId: string
let examTypeId: string
const controlId = `ISO-${tag}`

const as = (id: string, orgId: string, role: "RESEARCHER" | "ORG_ADMIN"): AuthUser =>
  member(id, [orgId, role])

const req = (path: string, init?: { method: "PUT"; body: unknown }) => request(path, init)
const withId = (id: string) => ({ params: Promise.resolve({ id }) })

beforeAll(async () => {
  orgA = (
    await prisma.organization.create({
      data: { name: `Rotas Org A ${tag}` },
      select: { id: true },
    })
  ).id
  orgB = (
    await prisma.organization.create({
      data: { name: `Rotas Org B ${tag}` },
      select: { id: true },
    })
  ).id

  await prisma.user.createMany({
    data: [memberA, outsiderA, adminA, memberB].map((id) => ({
      id,
      email: `iso-${id}@test.local`,
      name: "Teste",
    })),
  })
  await prisma.membership.createMany({
    data: [
      { userId: memberA, orgId: orgA, role: "RESEARCHER" },
      { userId: outsiderA, orgId: orgA, role: "RESEARCHER" },
      { userId: adminA, orgId: orgA, role: "ORG_ADMIN" },
      { userId: memberB, orgId: orgB, role: "ORG_ADMIN" },
    ],
  })

  // Catálogo próprio do teste (nome = chave): não depende do seed nem colide com ele.
  groupId = (
    await prisma.pathogenGroup.create({
      data: { key: `grp_iso_${tag}`, name: { pt: `grp_iso_${tag}`, en: `grp_iso_${tag}` } },
      select: { id: true },
    })
  ).id
  organId = (
    await prisma.organ.create({
      data: { key: `organ_iso_${tag}`, name: { pt: `organ_iso_${tag}`, en: `organ_iso_${tag}` } },
      select: { id: true },
    })
  ).id
  pathogenId = (
    await prisma.pathogen.create({
      data: { key: `pathogen_iso_${tag}`, groupId, scientificName: `Pathogenus iso${tag}` },
      select: { id: true },
    })
  ).id
  examTypeId = (
    await prisma.examType.create({
      data: { key: `exam_iso_${tag}`, name: { pt: `exam_iso_${tag}`, en: `exam_iso_${tag}` } },
      select: { id: true },
    })
  ).id

  researchA = (
    await prisma.research.create({
      data: {
        name: `Rotas Pesquisa A ${tag}`,
        orgId: orgA,
        members: { create: { userId: memberA } },
        protocols: { create: { organId, pathogenId, examTypeId } },
      },
      select: { id: true },
    })
  ).id
  animalA = (
    await prisma.animal.create({
      data: { researchId: researchA, orgId: orgA, controlId, species: "Sotalia guianensis" },
      select: { id: true },
    })
  ).id
  sampleA = (
    await prisma.sample.create({
      data: {
        animalId: animalA,
        researchId: researchA,
        organId,
        orgId: orgA,
        identification: `${controlId} AM`,
        sampleType: "Tecido",
      },
      select: { id: true },
    })
  ).id
})

afterAll(async () => {
  const ids = (xs: (string | undefined)[]) => xs.filter((x): x is string => !!x)
  const orgIds = ids([orgA, orgB])
  const analyses = await prisma.analysis.findMany({
    where: { sample: { orgId: { in: orgIds } } },
    select: { id: true },
  })
  await prisma.auditLog.deleteMany({ where: { entityId: { in: analyses.map((a) => a.id) } } })
  await prisma.analysis.deleteMany({ where: { sample: { orgId: { in: orgIds } } } })
  await prisma.sample.deleteMany({ where: { orgId: { in: orgIds } } })
  await prisma.animal.deleteMany({ where: { orgId: { in: orgIds } } })
  await prisma.research.deleteMany({ where: { orgId: { in: orgIds } } })
  const users = [memberA, outsiderA, adminA, memberB]
  await prisma.membership.deleteMany({ where: { userId: { in: users } } })
  await prisma.user.deleteMany({ where: { id: { in: users } } })
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
  await prisma.pathogen.deleteMany({ where: { id: { in: ids([pathogenId]) } } })
  await prisma.pathogenGroup.deleteMany({ where: { id: { in: ids([groupId]) } } })
  await prisma.examType.deleteMany({ where: { id: { in: ids([examTypeId]) } } })
  await prisma.organ.deleteMany({ where: { id: { in: ids([organId]) } } })
  await prisma.$disconnect()
})

// Rotas de LEITURA de um recurso da org A. Todas seguem a mesma regra de acesso.
const readRoutes: { name: string; call: () => Promise<Response> }[] = [
  {
    name: "GET /api/animals/[id]",
    call: () => getAnimal(req(`/api/animals/${animalA}`), withId(animalA)),
  },
  {
    name: "GET /api/animals/[id]/grid",
    call: () => getAnimalGrid(req(`/api/animals/${animalA}/grid`), withId(animalA)),
  },
  {
    name: "GET /api/research/[id]",
    call: () => getResearch(req(`/api/research/${researchA}`), withId(researchA)),
  },
  {
    name: "GET /api/research/[id]/results",
    call: () => getResearchResults(req(`/api/research/${researchA}/results`), withId(researchA)),
  },
  {
    name: "GET /api/research/[id]/export/darwin-core",
    call: () =>
      exportDarwinCore(req(`/api/research/${researchA}/export/darwin-core`), withId(researchA)),
  },
]

describe.each(readRoutes)("Isolamento na rota — $name", ({ call }) => {
  it("pesquisador vinculado à pesquisa alcança", async () => {
    login(as(memberA, orgA, "RESEARCHER"))
    expect((await call()).status).toBe(200)
  })

  it("admin da organização alcança mesmo sem vínculo com a pesquisa", async () => {
    login(as(adminA, orgA, "ORG_ADMIN"))
    expect((await call()).status).toBe(200)
  })

  it("usuário de OUTRA organização é barrado", async () => {
    login(as(memberB, orgB, "ORG_ADMIN"))
    expect((await call()).status).toBe(403)
  })

  it("pesquisador da mesma organização sem vínculo com a pesquisa é barrado", async () => {
    login(as(outsiderA, orgA, "RESEARCHER"))
    expect((await call()).status).toBe(403)
  })

  it("sem sessão responde 401", async () => {
    login(null)
    expect((await call()).status).toBe(401)
  })
})

describe("Isolamento na rota — conteúdo e listagem", () => {
  it("a exportação Darwin Core entrega o indivíduo só a quem alcança a pesquisa", async () => {
    login(as(memberA, orgA, "RESEARCHER"))
    const ok = await exportDarwinCore(
      req(`/api/research/${researchA}/export/darwin-core`),
      withId(researchA),
    )
    expect(await ok.text()).toContain(controlId)

    login(as(memberB, orgB, "ORG_ADMIN"))
    const denied = await exportDarwinCore(
      req(`/api/research/${researchA}/export/darwin-core`),
      withId(researchA),
    )
    expect(await denied.text()).not.toContain(controlId)
  })

  it("a listagem de animais só traz os da organização ativa e do escopo do pesquisador", async () => {
    const idsFor = async (user: AuthUser) => {
      login(user)
      const res = await listAnimals(req("/api/animals?pageSize=100"))
      expect(res.status).toBe(200)
      const body = (await res.json()) as { items: { id: string }[] }
      return body.items.map((a) => a.id)
    }
    expect(await idsFor(as(memberA, orgA, "RESEARCHER"))).toContain(animalA)
    expect(await idsFor(as(memberB, orgB, "ORG_ADMIN"))).not.toContain(animalA)
    expect(await idsFor(as(outsiderA, orgA, "RESEARCHER"))).not.toContain(animalA)
  })
})

describe("Isolamento na rota — lançamento de resultado (PUT /api/analyses)", () => {
  const launch = (result: "POSITIVO" | "NEGATIVO") =>
    putAnalysis(
      req("/api/analyses", {
        method: "PUT",
        body: { sampleId: sampleA, pathogenId, examTypeId, result },
      }),
    )
  const stored = () =>
    prisma.analysis.findFirst({
      where: { sampleId: sampleA, pathogenId, examTypeId, parentAnalysisId: null },
      select: { id: true, result: true },
    })

  it("usuário de outra organização não lança resultado", async () => {
    login(as(memberB, orgB, "ORG_ADMIN"))
    expect((await launch("POSITIVO")).status).toBe(403)
    expect(await stored()).toBeNull()
  })

  it("pesquisador sem vínculo com a pesquisa não lança resultado", async () => {
    login(as(outsiderA, orgA, "RESEARCHER"))
    expect((await launch("POSITIVO")).status).toBe(403)
    expect(await stored()).toBeNull()
  })

  it("pesquisador vinculado lança, e a alteração vai para a auditoria com o autor", async () => {
    login(as(memberA, orgA, "RESEARCHER"))
    expect((await launch("POSITIVO")).status).toBe(200)
    const created = await stored()
    expect(created?.result).toBe("POSITIVO")

    expect((await launch("NEGATIVO")).status).toBe(200)
    expect((await stored())?.result).toBe("NEGATIVO")

    const log = await prisma.auditLog.findMany({
      where: { entity: "Analysis", entityId: created!.id, field: "result" },
      orderBy: { changedAt: "asc" },
      select: { userId: true, oldValue: true, newValue: true, changedAt: true },
    })
    expect(log.map((l) => [l.oldValue, l.newValue])).toEqual([
      [null, "POSITIVO"],
      ["POSITIVO", "NEGATIVO"],
    ])
    expect(log.every((l) => l.userId === memberA)).toBe(true)
    expect(log.every((l) => l.changedAt instanceof Date)).toBe(true)
  })
})
