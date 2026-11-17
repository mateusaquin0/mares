import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { ERROR_CODES } from "@/lib/error-codes"
import { ctx, json, login, req } from "./helpers/route"
import { createFixtures } from "./helpers/org-fixtures"

// A rota de organização ativa grava um cookie pela API do Next, que só existe dentro de uma
// requisição real: aqui ela escreve neste registro, que os testes conferem.
const cookieJar = vi.hoisted(() => ({
  set: [] as { name: string; value: string; options: Record<string, unknown> }[],
  deleted: [] as string[],
}))
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookieJar.set.push({ name, value, options })
    },
    delete: (name: string) => {
      cookieJar.deleted.push(name)
    },
  }),
}))

import { POST as setActiveOrg, DELETE as clearActiveOrg } from "@/app/api/active-org/route"
import { GET as me } from "@/app/api/me/route"
import { GET as listSampleTypes, POST as addSampleType } from "@/app/api/me/sample-types/route"
import {
  PATCH as renameSampleType,
  DELETE as deleteSampleType,
} from "@/app/api/me/sample-types/[id]/route"
import { GET as dashboard } from "@/app/api/dashboard/route"
import { GET as pendingCounts } from "@/app/api/pending-counts/route"
import { GET as lookupUser } from "@/app/api/users/lookup/route"
import { GET as animalShares } from "@/app/api/animal-shares/route"

// Rotas de apoio da aplicação: organização ativa, dados da sessão, lista pessoal de tipos de
// amostra, dashboard, contadores de pendência, busca de usuário por e-mail e a caixa de
// compartilhamentos pendentes.

const fx = createFixtures("RotasDiv")

// Cada caso faz várias idas ao banco REMOTO de testes; o padrão de 5 s é curto para os mais longos.
vi.setConfig({ testTimeout: 30_000 })

let orgA: string
let orgB: string
let adminA: string
let creator: string
let outsider: string
let adminB: string
let sysAdmin: string
let r1: string
let r2: string
let animal1: { id: string; controlId: string }
let animal2: { id: string; controlId: string }

type Totals = { animals: number; samples: number; analyses: number; positive: number }

beforeAll(async () => {
  orgA = await fx.org("Org A")
  orgB = await fx.org("Org B")
  adminA = await fx.user({ name: "Admin A", memberships: [[orgA, "ORG_ADMIN"]] })
  creator = await fx.user({ name: "Criadora", memberships: [[orgA, "RESEARCHER"]] })
  outsider = await fx.user({ memberships: [[orgA, "RESEARCHER"]] })
  adminB = await fx.user({ memberships: [[orgB, "ORG_ADMIN"]] })
  sysAdmin = await fx.user({ isSystemAdmin: true })
  const cat = await fx.catalog()

  // r1: pesquisa da `creator`, com um indivíduo, uma amostra e uma análise positiva.
  r1 = await fx.research(orgA, { createdById: creator, members: [creator] })
  animal1 = await fx.animal(orgA, r1)
  const sampleId = await fx.sample(orgA, r1, animal1.id, cat.organId)
  await prisma.analysis.create({
    data: {
      sampleId,
      pathogenId: cat.pathogenId,
      examTypeId: cat.examTypeId,
      result: "POSITIVO",
    },
  })
  // r2: pesquisa do admin, sem membros, com outro indivíduo.
  r2 = await fx.research(orgA, { createdById: adminA })
  animal2 = await fx.animal(orgA, r2)

  // Compartilhamentos pendentes nos dois sentidos, ambos respondidos por quem integra r1:
  // convite de r2 oferecendo o indivíduo 2 a r1, e pedido de r2 pelo indivíduo 1 (de r1).
  await prisma.animalResearch.create({
    data: {
      animalId: animal2.id,
      researchId: r1,
      status: "PENDING",
      origin: "INVITE",
      invitedById: adminA,
    },
  })
  await prisma.animalResearch.create({
    data: {
      animalId: animal1.id,
      researchId: r2,
      status: "PENDING",
      origin: "REQUEST",
      invitedById: adminA,
      message: "precisamos do fígado",
    },
  })
})

beforeEach(() => {
  cookieJar.set.length = 0
  cookieJar.deleted.length = 0
})

afterAll(async () => {
  await fx.cleanup()
  await prisma.$disconnect()
})

describe("/api/active-org", () => {
  const post = (body: unknown) => setActiveOrg(req("/api/active-org", { body }))

  it("POST: 401 sem sessão", async () => {
    login(null)
    expect((await post({ orgId: orgA })).status).toBe(401)
    expect(cookieJar.set).toEqual([])
  })

  it("POST: grava o cookie httpOnly com o grupo escolhido entre os vínculos do usuário", async () => {
    const both = await fx.user({
      memberships: [
        [orgA, "RESEARCHER"],
        [orgB, "ORG_ADMIN"],
      ],
    })
    await fx.as(both)
    const res = await post({ orgId: orgB })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ activeOrgId: orgB })
    expect(cookieJar.set).toEqual([
      {
        name: "mares-active-org",
        value: orgB,
        options: expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
      },
    ])
  })

  it("POST: 403 para grupo a que o usuário não pertence (inclusive admin global)", async () => {
    for (const who of [adminA, sysAdmin]) {
      await fx.as(who)
      const res = await post({ orgId: orgB })
      expect(res.status).toBe(403)
      expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.notMember)
    }
    expect(cookieJar.set).toEqual([])
  })

  it("POST: 422 sem orgId", async () => {
    await fx.as(adminA)
    expect((await post({})).status).toBe(422)
    expect((await post({ orgId: "" })).status).toBe(422)
    expect(cookieJar.set).toEqual([])
  })

  it("DELETE: apaga o cookie mesmo sem sessão (chamado depois do logout)", async () => {
    login(null)
    const res = await clearActiveOrg()
    expect(res.status).toBe(204)
    expect(cookieJar.deleted).toEqual(["mares-active-org"])
  })
})

describe("GET /api/me", () => {
  it("401 sem sessão", async () => {
    login(null)
    expect((await me()).status).toBe(401)
  })

  it("devolve o usuário, os vínculos e o grupo ativo", async () => {
    const both = await fx.user({
      name: "Dois Grupos",
      memberships: [
        [orgA, "RESEARCHER"],
        [orgB, "ORG_ADMIN"],
      ],
    })
    await fx.as(both, orgB)
    const res = await me()
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({
      id: both,
      email: `${both}@test.local`,
      name: "Dois Grupos",
      isSystemAdmin: false,
      memberships: [
        expect.objectContaining({ orgId: orgA, role: "RESEARCHER" }),
        expect.objectContaining({ orgId: orgB, role: "ORG_ADMIN" }),
      ],
      activeOrgId: orgB,
    })
  })

  it("admin global: sem vínculos e sem grupo ativo", async () => {
    await fx.as(sysAdmin)
    expect(await json(await me())).toMatchObject({
      id: sysAdmin,
      isSystemAdmin: true,
      memberships: [],
      activeOrgId: null,
    })
  })
})

describe("/api/me/sample-types", () => {
  const add = (value: unknown) => addSampleType(req("/api/me/sample-types", { body: { value } }))
  const rename = (id: string, value: unknown) =>
    renameSampleType(
      req(`/api/me/sample-types/${id}`, { method: "PATCH", body: { value } }),
      ctx({ id }),
    )
  const remove = (id: string) =>
    deleteSampleType(req(`/api/me/sample-types/${id}`, { method: "DELETE" }), ctx({ id }))
  const valuesOf = async (userId: string) =>
    (await prisma.userSampleType.findMany({ where: { userId }, orderBy: { value: "asc" } })).map(
      (t) => t.value,
    )

  it("401 sem sessão nas quatro operações", async () => {
    login(null)
    expect((await listSampleTypes()).status).toBe(401)
    expect((await add("Tecido")).status).toBe(401)
    expect((await rename(randomUUID(), "Tecido")).status).toBe(401)
    expect((await remove(randomUUID())).status).toBe(401)
  })

  it("cada usuário mantém e enxerga só a própria lista, em ordem alfabética", async () => {
    const owner = await fx.user()
    const other = await fx.user()
    await fx.as(owner)
    const soro = await add("  Soro ")
    expect(soro.status).toBe(201)
    expect(await json(soro)).toEqual({ id: expect.any(String), value: "Soro" })
    expect((await add("DNA extraído")).status).toBe(201)

    const res = await listSampleTypes()
    expect(res.status).toBe(200)
    expect((await json<{ value: string }[]>(res)).map((t) => t.value)).toEqual([
      "DNA extraído",
      "Soro",
    ])
    expect(await valuesOf(owner)).toEqual(["DNA extraído", "Soro"])

    await fx.as(other)
    expect(await json(await listSampleTypes())).toEqual([])
    // O mesmo texto na lista de outra pessoa não é duplicata.
    expect((await add("Soro")).status).toBe(201)
  })

  it("409 para duplicata que só difere em caixa, acento ou espaços; 422 vazio", async () => {
    const owner = await fx.user()
    await fx.as(owner)
    expect((await add("DNA extraído")).status).toBe(201)
    const dup = await add("dna   EXTRAIDO")
    expect(dup.status).toBe(409)
    expect((await json<{ code: string }>(dup)).code).toBe(ERROR_CODES.sampleTypeDuplicate)
    expect((await add("   ")).status).toBe(422)
    expect((await add("x".repeat(256))).status).toBe(422)
    expect(await valuesOf(owner)).toEqual(["DNA extraído"])
  })

  it("409 quando a lista chega a 50 itens", async () => {
    const owner = await fx.user()
    await prisma.userSampleType.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({ userId: owner, value: `Tipo ${i}` })),
    })
    await fx.as(owner)
    const res = await add("Mais um")
    expect(res.status).toBe(409)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.sampleTypeLimit)
    expect(await prisma.userSampleType.count({ where: { userId: owner } })).toBe(50)
  })

  it("renomeia o próprio item; recusa colisão com outro item da lista", async () => {
    const owner = await fx.user()
    await fx.as(owner)
    const soro = await json<{ id: string }>(await add("Soro"))
    await add("Lâmina")

    const ok = await rename(soro.id, " Soro congelado ")
    expect(ok.status).toBe(200)
    expect(await json(ok)).toEqual({ id: soro.id, value: "Soro congelado" })
    // Ajustar caixa/acento do PRÓPRIO item não colide consigo mesmo.
    expect((await rename(soro.id, "SORO CONGELADO")).status).toBe(200)

    const clash = await rename(soro.id, "lamina")
    expect(clash.status).toBe(409)
    expect((await json<{ code: string }>(clash)).code).toBe(ERROR_CODES.sampleTypeDuplicate)
    expect((await rename(soro.id, "")).status).toBe(422)
    expect(await valuesOf(owner)).toEqual(["Lâmina", "SORO CONGELADO"])
  })

  it("item de outra pessoa responde 404 ao renomear e ao excluir", async () => {
    const owner = await fx.user()
    const other = await fx.user()
    await fx.as(owner)
    const item = await json<{ id: string }>(await add("Parafina"))

    await fx.as(other)
    const renamed = await rename(item.id, "Tomado")
    expect(renamed.status).toBe(404)
    expect((await json<{ code: string }>(renamed)).code).toBe(ERROR_CODES.sampleTypeNotFound)
    expect((await remove(item.id)).status).toBe(404)
    expect(await valuesOf(owner)).toEqual(["Parafina"])
  })

  it("exclui o próprio item; amostras já cadastradas não mudam", async () => {
    const owner = await fx.user()
    await fx.as(owner)
    const item = await json<{ id: string }>(await add("Tecido"))
    const samplesBefore = await prisma.sample.count({
      where: { orgId: orgA, sampleType: "Tecido" },
    })

    expect((await remove(item.id)).status).toBe(204)
    expect(await valuesOf(owner)).toEqual([])
    expect(await prisma.sample.count({ where: { orgId: orgA, sampleType: "Tecido" } })).toBe(
      samplesBefore,
    )
    expect((await remove(item.id)).status).toBe(404)
  })
})

describe("GET /api/dashboard", () => {
  const get = (query = "") => dashboard(req(`/api/dashboard${query}`))
  const totals = async (res: Response) => (await json<{ totals: Totals }>(res)).totals
  const zero = { animals: 0, samples: 0, analyses: 0, positive: 0 }

  it("401 sem sessão", async () => {
    login(null)
    expect((await get()).status).toBe(401)
  })

  it("pesquisador agrega só as pesquisas em que é membro", async () => {
    await fx.as(creator)
    const res = await get()
    expect(res.status).toBe(200)
    const body = await json<{ totals: Totals; species: { name: string; count: number }[] }>(res)
    expect(body.totals).toMatchObject({ animals: 1, samples: 1, analyses: 1, positive: 1 })
    expect(body.species).toEqual([{ name: "Sotalia guianensis", count: 1 }])
  })

  it("admin do grupo agrega todas as pesquisas do grupo e pode filtrar por uma", async () => {
    await fx.as(adminA)
    expect(await totals(await get())).toMatchObject({ animals: 2, samples: 1, analyses: 1 })
    expect(await totals(await get(`?researchId=${r2}`))).toMatchObject({
      animals: 1,
      samples: 0,
      analyses: 0,
    })
  })

  it("pesquisador sem vínculo, ou filtrando pesquisa fora do escopo, recebe o painel zerado", async () => {
    await fx.as(outsider)
    expect(await totals(await get())).toMatchObject(zero)
    await fx.as(creator)
    expect(await totals(await get(`?researchId=${r2}`))).toMatchObject(zero)
  })

  it("outro grupo e o admin global (sem grupo ativo) não enxergam os dados", async () => {
    await fx.as(adminB)
    expect(await totals(await get())).toMatchObject(zero)
    expect(await totals(await get(`?researchId=${r1}`))).toMatchObject(zero)
    await fx.as(sysAdmin)
    const res = await get()
    expect(res.status).toBe(200)
    expect(await totals(res)).toMatchObject(zero)
  })

  it("o período filtra os indivíduos pela data do encalhe", async () => {
    await fx.as(adminA)
    expect(await totals(await get("?from=2026-03-01&to=2026-03-31"))).toMatchObject({ animals: 2 })
    expect(await totals(await get("?from=2026-04-01"))).toMatchObject({ animals: 0 })
  })
})

describe("GET /api/pending-counts", () => {
  type Counts = {
    accessRequests: number
    feedback: number
    feedbackReplies: number
    glossaryRequests: number
    researchAccess: number
    animalShares: number
  }
  const counts = async () => json<Counts>(await pendingCounts())

  beforeAll(async () => {
    // Uma pendência de cada tipo, todas deste teste.
    const join = await prisma.joinRequest.create({
      data: {
        email: `pendencia-${fx.tag}@test.local`,
        requesterName: "Pendência",
        organizationName: fx.unique("Grupo pendente"),
      },
    })
    fx.tracked.joinRequests.add(join.id)
    const glossary = await prisma.catalogRequest.create({
      data: {
        type: "ORGAN",
        payload: { namePt: fx.unique("pendente"), nameEn: fx.unique("pending") },
        requestedById: outsider,
        requestedByEmail: `${outsider}@test.local`,
      },
    })
    fx.tracked.catalogRequests.add(glossary.id)
    // Ticket da `creator` com resposta da administração ainda não lida.
    const feedback = await prisma.feedback.create({
      data: {
        type: "BUG",
        title: "t",
        message: "m",
        createdById: creator,
        createdByEmail: `${creator}@test.local`,
        messages: {
          create: {
            body: "resposta",
            party: "ADMIN",
            createdById: sysAdmin,
            createdByEmail: `${sysAdmin}@test.local`,
          },
        },
      },
    })
    fx.tracked.feedbacks.add(feedback.id)
    await prisma.researchAccessRequest.create({ data: { researchId: r1, userId: outsider } })
  })

  it("401 sem sessão", async () => {
    login(null)
    expect((await pendingCounts()).status).toBe(401)
  })

  it("pesquisador: só o que ele pode tratar (as próprias respostas e as pesquisas que gere)", async () => {
    await fx.as(creator)
    const res = await pendingCounts()
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({
      accessRequests: 0,
      feedback: 0,
      feedbackReplies: 1,
      glossaryRequests: 0,
      researchAccess: 1,
      animalShares: 2,
    })
  })

  it("pesquisador sem vínculo nem tickets: tudo zerado", async () => {
    await fx.as(outsider)
    expect(await counts()).toEqual({
      accessRequests: 0,
      feedback: 0,
      feedbackReplies: 0,
      glossaryRequests: 0,
      researchAccess: 0,
      animalShares: 0,
    })
  })

  it("admin do grupo: curadoria do glossário e as pendências de todas as pesquisas do grupo", async () => {
    await fx.as(adminA)
    const c = await counts()
    expect(c).toMatchObject({
      accessRequests: 0,
      feedback: 0,
      feedbackReplies: 0,
      researchAccess: 1,
      animalShares: 2,
    })
    expect(c.glossaryRequests).toBeGreaterThanOrEqual(1)

    // Pendências de outro grupo não entram.
    await fx.as(adminB)
    expect(await counts()).toMatchObject({ researchAccess: 0, animalShares: 0 })
  })

  it("admin global: solicitações de grupo, tickets a triar e glossário; nada de grupo", async () => {
    await fx.as(sysAdmin)
    const c = await counts()
    expect(c.accessRequests).toBeGreaterThanOrEqual(1)
    expect(c.feedback).toBeGreaterThanOrEqual(1)
    expect(c.glossaryRequests).toBeGreaterThanOrEqual(1)
    expect(c).toMatchObject({ researchAccess: 0, animalShares: 0, feedbackReplies: 0 })
  })
})

describe("GET /api/users/lookup", () => {
  const lookup = (email?: string) =>
    lookupUser(
      req(`/api/users/lookup${email === undefined ? "" : `?email=${encodeURIComponent(email)}`}`),
    )

  it("401 sem sessão; 403 para pesquisador", async () => {
    login(null)
    expect((await lookup(`${creator}@test.local`)).status).toBe(401)
    await fx.as(creator)
    expect((await lookup(`${adminA}@test.local`)).status).toBe(403)
  })

  it("admin de grupo descobre se o e-mail já tem conta, sem diferenciar caixa", async () => {
    await fx.as(adminA)
    const res = await lookup(`  ${creator}@TEST.local `)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ exists: true, name: "Criadora" })
    expect(await json(await lookup(`ninguem-${fx.tag}@test.local`))).toEqual({
      exists: false,
      name: null,
    })
  })

  it("o admin global não aparece como convidável, mas pode usar a busca", async () => {
    await fx.as(adminA)
    expect(await json(await lookup(`${sysAdmin}@test.local`))).toEqual({
      exists: false,
      name: null,
    })
    await fx.as(sysAdmin)
    expect(await json(await lookup(`${adminA}@test.local`))).toEqual({
      exists: true,
      name: "Admin A",
    })
  })

  it("422 sem e-mail, com formato inválido ou acima de 254 caracteres", async () => {
    await fx.as(adminA)
    for (const email of [undefined, "", "sem-arroba", `${"a".repeat(250)}@test.local`]) {
      const res = await lookup(email)
      expect(res.status).toBe(422)
      expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.validation)
    }
  })
})

describe("GET /api/animal-shares", () => {
  type Share = {
    origin: string
    message: string | null
    research: { id: string }
    fromResearch: { id: string }
    animal: { id: string; controlId: string }
    invitedBy: { email: string } | null
  }

  it("401 sem sessão", async () => {
    login(null)
    expect((await animalShares()).status).toBe(401)
  })

  it("membro da pesquisa vê o convite recebido e o pedido sobre o indivíduo dela", async () => {
    await fx.as(creator)
    const res = await animalShares()
    expect(res.status).toBe(200)
    const rows = await json<Share[]>(res)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.origin === "INVITE")).toMatchObject({
      research: { id: r1 },
      fromResearch: { id: r2 },
      animal: { id: animal2.id, controlId: animal2.controlId },
      invitedBy: { email: `${adminA}@test.local` },
    })
    expect(rows.find((r) => r.origin === "REQUEST")).toMatchObject({
      research: { id: r2 },
      fromResearch: { id: r1 },
      animal: { id: animal1.id },
      message: "precisamos do fígado",
    })
  })

  it("admin do grupo vê todas as pendências do grupo; compartilhamento aceito não aparece", async () => {
    const r3 = await fx.research(orgA, { createdById: adminA })
    await prisma.animalResearch.create({
      data: { animalId: animal1.id, researchId: r3, status: "ACCEPTED" },
    })
    await fx.as(adminA)
    const rows = await json<Share[]>(await animalShares())
    expect(rows.map((r) => r.origin).sort()).toEqual(["INVITE", "REQUEST"])
    expect(rows.map((r) => r.research.id)).not.toContain(r3)
  })

  it("pesquisador sem vínculo, outro grupo e admin global recebem lista vazia", async () => {
    for (const who of [outsider, adminB, sysAdmin]) {
      await fx.as(who)
      const res = await animalShares()
      expect(res.status).toBe(200)
      expect(await json(res)).toEqual([])
    }
  })
})
