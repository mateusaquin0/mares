import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import ExcelJS from "exceljs"
import { prisma } from "@/lib/prisma"
import { ERROR_CODES } from "@/lib/error-codes"
import { ctx, json, login, req } from "./helpers/route"
import { createFixtures } from "./helpers/org-fixtures"

import { GET as listResearch, POST as createResearch } from "@/app/api/research/route"
import { GET as researchCatalog } from "@/app/api/research/catalog/route"
import {
  GET as getResearch,
  PUT as updateResearch,
  DELETE as deleteResearch,
} from "@/app/api/research/[id]/route"
import { GET as listProtocol, POST as addProtocol } from "@/app/api/research/[id]/protocol/route"
import {
  DELETE as deleteProtocol,
  PATCH as patchProtocol,
} from "@/app/api/research/[id]/protocol/[protocolId]/route"
import { GET as getResults } from "@/app/api/research/[id]/results/route"
import { GET as exportDwc } from "@/app/api/research/[id]/export/darwin-core/route"
import { GET as exportXlsx } from "@/app/api/research/[id]/export/xlsx/route"

// Pesquisas pelas PRÓPRIAS rotas: CRUD, catálogo do grupo, protocolo, grade de resultados e
// exportações. Papéis em jogo: admin do grupo (vê todas), criador, pesquisador vinculado,
// pesquisador do grupo SEM vínculo, admin de outro grupo e admin global (não participa de
// grupo: não satisfaz papel de organização).

const fx = createFixtures("RotasPesq")

// Cada caso faz várias idas ao banco REMOTO de testes; o padrão de 5 s é curto para os mais longos.
vi.setConfig({ testTimeout: 30_000 })

let orgA: string
let orgB: string
let adminA: string
let creator: string
let linked: string
let outsider: string
let adminB: string
let sysAdmin: string
let cat: Awaited<ReturnType<typeof fx.catalog>>
let cat2: Awaited<ReturnType<typeof fx.catalog>>

// Pesquisa principal (privada), criada pelo `creator`, com `linked` vinculado.
let main: string
let mainProtocol: string
let animalMain: { id: string; controlId: string }
let sampleMain: string
// Pesquisa de outro grupo.
let foreign: string

const withId = (id: string) => ctx({ id })

beforeAll(async () => {
  orgA = await fx.org("Org A")
  orgB = await fx.org("Org B")
  adminA = await fx.user({ memberships: [[orgA, "ORG_ADMIN"]] })
  creator = await fx.user({ memberships: [[orgA, "RESEARCHER"]] })
  linked = await fx.user({ memberships: [[orgA, "RESEARCHER"]] })
  outsider = await fx.user({ memberships: [[orgA, "RESEARCHER"]] })
  adminB = await fx.user({ memberships: [[orgB, "ORG_ADMIN"]] })
  sysAdmin = await fx.user({ isSystemAdmin: true })
  cat = await fx.catalog()
  cat2 = await fx.catalog()

  main = await fx.research(orgA, { createdById: creator, members: [creator, linked] })
  mainProtocol = (
    await prisma.researchProtocol.create({
      data: {
        researchId: main,
        organId: cat.organId,
        pathogenId: cat.pathogenId,
        examTypeId: cat.examTypeId,
      },
      select: { id: true },
    })
  ).id
  animalMain = await fx.animal(orgA, main)
  sampleMain = await fx.sample(orgA, main, animalMain.id, cat.organId)
  await prisma.analysis.create({
    data: {
      sampleId: sampleMain,
      pathogenId: cat.pathogenId,
      examTypeId: cat.examTypeId,
      result: "POSITIVO",
    },
  })
  foreign = await fx.research(orgB, { createdById: adminB, members: [adminB] })
})

afterAll(async () => {
  await fx.cleanup()
  await prisma.$disconnect()
})

describe("GET /api/research", () => {
  it("401 sem sessão", async () => {
    login(null)
    expect((await listResearch()).status).toBe(401)
  })

  it("pesquisador recebe só as pesquisas em que é membro", async () => {
    const hidden = await fx.research(orgA, { createdById: adminA })
    await fx.as(linked)
    const res = await listResearch()
    expect(res.status).toBe(200)
    const rows = await json<{ id: string; _count: { animals: number; protocols: number } }[]>(res)
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(main)
    expect(ids).not.toContain(hidden)
    expect(ids).not.toContain(foreign)
    expect(rows.find((r) => r.id === main)!._count).toEqual({ animals: 1, protocols: 1 })
  })

  it("pesquisador sem vínculo algum recebe lista vazia", async () => {
    await fx.as(outsider)
    expect(await json(await listResearch())).toEqual([])
  })

  it("admin do grupo recebe todas as do grupo e nenhuma de outro", async () => {
    const other = await fx.research(orgA, { createdById: creator, members: [creator] })
    await fx.as(adminA)
    const ids = (await json<{ id: string }[]>(await listResearch())).map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining([main, other]))
    expect(ids).not.toContain(foreign)
  })

  it("admin global (sem grupo ativo) recebe lista vazia", async () => {
    await fx.as(sysAdmin)
    const res = await listResearch()
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual([])
  })
})

describe("POST /api/research", () => {
  it("401 sem sessão", async () => {
    login(null)
    const res = await createResearch(req("/api/research", { body: { name: "Sem sessão" } }))
    expect(res.status).toBe(401)
  })

  it("cria a pesquisa, vincula o criador e grava o protocolo", async () => {
    await fx.as(creator)
    const name = fx.unique("Criada")
    const res = await createResearch(
      req("/api/research", {
        body: {
          name: `  ${name}  `,
          description: "  descrição  ",
          isPublic: true,
          protocols: [
            { organId: cat.organId, pathogenId: cat.pathogenId, examTypeId: cat.examTypeId },
          ],
        },
      }),
    )
    expect(res.status).toBe(201)
    const body = await json<{ id: string; name: string }>(res)
    expect(body.name).toBe(name)

    const row = await prisma.research.findUniqueOrThrow({
      where: { id: body.id },
      include: { members: true, protocols: true },
    })
    expect(row).toMatchObject({
      orgId: orgA,
      createdById: creator,
      isPublic: true,
      description: "descrição",
    })
    expect(row.members.map((m) => m.userId)).toEqual([creator])
    expect(row.protocols).toHaveLength(1)
    expect(row.protocols[0]).toMatchObject({ organId: cat.organId, status: "ACTIVE" })
  })

  it("privada por padrão e sem protocolo quando não informados", async () => {
    await fx.as(adminA)
    const res = await createResearch(req("/api/research", { body: { name: fx.unique("Padrão") } }))
    expect(res.status).toBe(201)
    const { id } = await json<{ id: string }>(res)
    const row = await prisma.research.findUniqueOrThrow({
      where: { id },
      include: { protocols: true },
    })
    expect(row.isPublic).toBe(false)
    expect(row.description).toBeNull()
    expect(row.protocols).toEqual([])
  })

  it("422 com nome curto ou corpo inválido", async () => {
    await fx.as(creator)
    const short = await createResearch(req("/api/research", { body: { name: "ab" } }))
    expect(short.status).toBe(422)
    expect((await json<{ code: string }>(short)).code).toBe(ERROR_CODES.validation)
    const long = await createResearch(req("/api/research", { body: { name: "x".repeat(101) } }))
    expect(long.status).toBe(422)
    const empty = await createResearch(req("/api/research", { method: "POST" }))
    expect(empty.status).toBe(422)
  })

  it("admin global não cria pesquisa (não participa de grupo)", async () => {
    await fx.as(sysAdmin)
    const name = fx.unique("Do admin global")
    const res = await createResearch(req("/api/research", { body: { name } }))
    expect([401, 403]).toContain(res.status)
    expect(await prisma.research.count({ where: { name } })).toBe(0)
  })
})

describe("GET /api/research/catalog", () => {
  it("401 sem sessão", async () => {
    login(null)
    expect((await researchCatalog()).status).toBe(401)
  })

  it("lista todas as pesquisas do grupo, sem contagens para quem não tem acesso aos dados", async () => {
    await prisma.researchAccessRequest.create({ data: { researchId: main, userId: outsider } })
    await fx.as(outsider)
    const res = await researchCatalog()
    expect(res.status).toBe(200)
    const rows = await json<
      {
        id: string
        isMember: boolean
        canSeeData: boolean
        _count: unknown
        requestStatus: string | null
        createdBy: { email: string } | null
      }[]
    >(res)
    const row = rows.find((r) => r.id === main)!
    expect(row).toMatchObject({
      isMember: false,
      canSeeData: false,
      _count: null,
      requestStatus: "PENDING",
    })
    expect(row.createdBy?.email).toBe(`${creator}@test.local`)
    expect(rows.map((r) => r.id)).not.toContain(foreign)
    await prisma.researchAccessRequest.deleteMany({ where: { researchId: main, userId: outsider } })
  })

  it("membro vê as contagens; admin vê os dados sem ser membro", async () => {
    await fx.as(linked)
    const mine = (
      await json<{ id: string; isMember: boolean; canSeeData: boolean; _count: unknown }[]>(
        await researchCatalog(),
      )
    ).find((r) => r.id === main)!
    expect(mine).toMatchObject({
      isMember: true,
      canSeeData: true,
      _count: { animals: 1, protocols: 1 },
    })

    await fx.as(adminA)
    const asAdmin = (
      await json<{ id: string; isMember: boolean; canSeeData: boolean }[]>(await researchCatalog())
    ).find((r) => r.id === main)!
    expect(asAdmin).toMatchObject({ isMember: false, canSeeData: true })
  })

  it("admin global (sem grupo ativo) recebe lista vazia", async () => {
    await fx.as(sysAdmin)
    expect(await json(await researchCatalog())).toEqual([])
  })
})

// As rotas de leitura de UMA pesquisa seguem a mesma regra de acesso.
const readRoutes: { name: string; call: (id: string) => Promise<Response> }[] = [
  { name: "GET /api/research/[id]", call: (id) => getResearch(req(`/r/${id}`), withId(id)) },
  {
    name: "GET /api/research/[id]/protocol",
    call: (id) => listProtocol(req(`/r/${id}/protocol`), withId(id)),
  },
  {
    name: "GET /api/research/[id]/results",
    call: (id) => getResults(req(`/r/${id}/results`), withId(id)),
  },
  {
    name: "GET /api/research/[id]/export/darwin-core",
    call: (id) => exportDwc(req(`/r/${id}/export/darwin-core`), withId(id)),
  },
  {
    name: "GET /api/research/[id]/export/xlsx",
    call: (id) => exportXlsx(req(`/r/${id}/export/xlsx`), withId(id)),
  },
]

describe.each(readRoutes)("$name — acesso", ({ call }) => {
  it("membro da pesquisa e admin do grupo alcançam (200)", async () => {
    await fx.as(linked)
    expect((await call(main)).status).toBe(200)
    await fx.as(adminA)
    expect((await call(main)).status).toBe(200)
  })

  it("401 sem sessão", async () => {
    login(null)
    expect((await call(main)).status).toBe(401)
  })

  it("403 para outro grupo, para pesquisador sem vínculo e para o admin global", async () => {
    await fx.as(adminB)
    expect((await call(main)).status).toBe(403)
    await fx.as(outsider)
    expect((await call(main)).status).toBe(403)
    await fx.as(sysAdmin)
    expect((await call(main)).status).toBe(403)
  })

  it("404 para pesquisa inexistente", async () => {
    await fx.as(adminA)
    const res = await call(randomUUID())
    expect(res.status).toBe(404)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.researchNotFound)
  })
})

describe("GET /api/research/[id]", () => {
  it("devolve a pesquisa com o protocolo e a contagem de animais", async () => {
    await fx.as(linked)
    const body = await json<{
      id: string
      orgId: string
      createdById: string
      _count: { animals: number }
      protocols: { id: string; status: string; organ: { id: string } }[]
    }>(await getResearch(req(`/api/research/${main}`), withId(main)))
    expect(body).toMatchObject({ id: main, orgId: orgA, createdById: creator })
    expect(body._count.animals).toBe(1)
    expect(body.protocols).toEqual([
      expect.objectContaining({
        id: mainProtocol,
        status: "ACTIVE",
        organ: expect.objectContaining({ id: cat.organId }),
      }),
    ])
  })
})

describe("PUT /api/research/[id]", () => {
  const put = (id: string, body: unknown) =>
    updateResearch(req(`/api/research/${id}`, { method: "PUT", body }), withId(id))

  it("401 sem sessão", async () => {
    login(null)
    expect((await put(main, { name: "Sem sessão" })).status).toBe(401)
  })

  it("o criador edita nome, descrição e visibilidade", async () => {
    const id = await fx.research(orgA, { createdById: creator, members: [creator] })
    await fx.as(creator)
    const name = fx.unique("Renomeada")
    const res = await put(id, { name: ` ${name} `, description: "nova", isPublic: true })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ id, name, description: "nova", isPublic: true })
    expect(await prisma.research.findUniqueOrThrow({ where: { id } })).toMatchObject({
      name,
      description: "nova",
      isPublic: true,
    })

    // Descrição vazia limpa o campo.
    await put(id, { description: "" })
    expect((await prisma.research.findUniqueOrThrow({ where: { id } })).description).toBeNull()
  })

  it("o admin do grupo edita a pesquisa de outra pessoa", async () => {
    const id = await fx.research(orgA, { createdById: creator, members: [creator] })
    await fx.as(adminA)
    const res = await put(id, { isPublic: true })
    expect(res.status).toBe(200)
    expect((await prisma.research.findUniqueOrThrow({ where: { id } })).isPublic).toBe(true)
  })

  it("membro que não é o criador não edita conteúdo nem visibilidade", async () => {
    await fx.as(linked)
    const before = await prisma.research.findUniqueOrThrow({ where: { id: main } })

    const content = await put(main, { name: "Tentativa de edição" })
    expect(content.status).toBe(403)
    expect((await json<{ code: string }>(content)).code).toBe(ERROR_CODES.researchEditNotCreator)

    const visibility = await put(main, { isPublic: !before.isPublic })
    expect(visibility.status).toBe(403)
    expect((await json<{ code: string }>(visibility)).code).toBe(
      ERROR_CODES.researchVisibilityAdminOnly,
    )

    // Reenviar o valor atual da visibilidade não é alteração.
    expect((await put(main, { isPublic: before.isPublic })).status).toBe(200)
    const after = await prisma.research.findUniqueOrThrow({ where: { id: main } })
    expect(after).toMatchObject({ name: before.name, isPublic: before.isPublic })
  })

  it("o criador removido da pesquisa perde a edição", async () => {
    const id = await fx.research(orgA, { createdById: creator, members: [linked] })
    await fx.as(creator)
    expect((await put(id, { name: "Voltei sem vínculo" })).status).toBe(403)
  })

  it("403 para outro grupo, pesquisador sem vínculo e admin global", async () => {
    for (const who of [adminB, outsider, sysAdmin]) {
      await fx.as(who)
      expect((await put(main, { name: "Invasão" })).status).toBe(403)
    }
  })

  it("422 com nome curto; 404 para pesquisa inexistente", async () => {
    await fx.as(creator)
    expect((await put(main, { name: "ab" })).status).toBe(422)
    expect((await put(randomUUID(), { name: "Não existe" })).status).toBe(404)
  })
})

describe("DELETE /api/research/[id]", () => {
  const del = (id: string) =>
    deleteResearch(req(`/api/research/${id}`, { method: "DELETE" }), withId(id))

  it("401 sem sessão", async () => {
    login(null)
    expect((await del(main)).status).toBe(401)
  })

  it("só o admin do grupo exclui: criador, outro grupo e admin global recebem 403", async () => {
    const id = await fx.research(orgA, { createdById: creator, members: [creator] })
    for (const who of [creator, adminB, sysAdmin]) {
      await fx.as(who)
      expect((await del(id)).status).toBe(403)
    }
    expect(await prisma.research.count({ where: { id } })).toBe(1)
  })

  it("exclui a pesquisa vazia junto com vínculos, protocolo e pedidos de acesso", async () => {
    const id = await fx.research(orgA, { createdById: creator, members: [creator, linked] })
    await prisma.researchProtocol.create({
      data: {
        researchId: id,
        organId: cat.organId,
        pathogenId: cat.pathogenId,
        examTypeId: cat.examTypeId,
      },
    })
    await prisma.researchAccessRequest.create({ data: { researchId: id, userId: outsider } })

    await fx.as(adminA)
    const res = await del(id)
    expect(res.status).toBe(204)
    expect(await prisma.research.count({ where: { id } })).toBe(0)
    expect(await prisma.researchMember.count({ where: { researchId: id } })).toBe(0)
    expect(await prisma.researchProtocol.count({ where: { researchId: id } })).toBe(0)
    expect(await prisma.researchAccessRequest.count({ where: { researchId: id } })).toBe(0)
  })

  it("409 quando a pesquisa tem animais", async () => {
    await fx.as(adminA)
    const res = await del(main)
    expect(res.status).toBe(409)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.researchHasAnimals)
    expect(await prisma.research.count({ where: { id: main } })).toBe(1)
  })

  it("404 para pesquisa inexistente", async () => {
    await fx.as(adminA)
    expect((await del(randomUUID())).status).toBe(404)
  })

  // BUG: a checagem só conta animais PRIMÁRIOS. Com amostra de um indivíduo compartilhado a
  // exclusão esbarra na FK de Sample.researchId e responde 500; deveria ser 409 como acima.
  it.fails("409 quando a pesquisa tem amostras de indivíduo compartilhado", async () => {
    const guest = await fx.research(orgA, { createdById: creator, members: [creator] })
    await prisma.animalResearch.create({
      data: { animalId: animalMain.id, researchId: guest, status: "ACCEPTED" },
    })
    await fx.sample(orgA, guest, animalMain.id, cat.organId)

    await fx.as(adminA)
    const res = await del(guest)
    expect(res.status).toBe(409)
  })
})

describe("POST /api/research/[id]/protocol", () => {
  const add = (id: string, body: unknown) =>
    addProtocol(req(`/api/research/${id}/protocol`, { body }), withId(id))
  const entry = () => ({
    organId: cat2.organId,
    pathogenId: cat2.pathogenId,
    examTypeId: cat2.examTypeId,
  })

  it("401 sem sessão; 403 sem vínculo, de outro grupo e admin global", async () => {
    login(null)
    expect((await add(main, { entries: [entry()] })).status).toBe(401)
    for (const who of [outsider, adminB, sysAdmin]) {
      await fx.as(who)
      expect((await add(main, { entries: [entry()] })).status).toBe(403)
    }
    expect(
      await prisma.researchProtocol.count({ where: { researchId: main, organId: cat2.organId } }),
    ).toBe(0)
  })

  it("membro vinculado adiciona; reenviar não duplica; inativa é reativada", async () => {
    const id = await fx.research(orgA, { createdById: creator, members: [creator, linked] })
    await fx.as(linked)

    const first = await add(id, { entries: [entry()] })
    expect(first.status).toBe(201)
    expect(await json(first)).toEqual({ added: 1 })
    const row = await prisma.researchProtocol.findFirstOrThrow({ where: { researchId: id } })
    expect(row).toMatchObject({ ...entry(), status: "ACTIVE" })

    const again = await add(id, { entries: [entry()] })
    expect(await json(again)).toEqual({ added: 0 })
    expect(await prisma.researchProtocol.count({ where: { researchId: id } })).toBe(1)

    await prisma.researchProtocol.update({
      where: { id: row.id },
      data: { status: "INACTIVE", deactivatedAt: new Date() },
    })
    const reactivated = await add(id, { entries: [entry()] })
    expect(await json(reactivated)).toEqual({ added: 1 })
    expect(
      await prisma.researchProtocol.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({ status: "ACTIVE", deactivatedAt: null })
  })

  it("422 com lista vazia ou entrada incompleta", async () => {
    await fx.as(linked)
    expect((await add(main, { entries: [] })).status).toBe(422)
    expect((await add(main, { entries: [{ organId: cat.organId }] })).status).toBe(422)
    expect((await add(main, null)).status).toBe(422)
  })

  // BUG: ids de glossário inexistentes não são validados; a FK estoura e a rota responde 500.
  // Deveria recusar a entrada (404 do item ou 422).
  it.fails("recusa item de glossário inexistente sem erro interno", async () => {
    await fx.as(linked)
    const res = await add(main, {
      entries: [{ organId: randomUUID(), pathogenId: cat.pathogenId, examTypeId: cat.examTypeId }],
    })
    expect([404, 422]).toContain(res.status)
  })
})

describe("GET /api/research/[id]/protocol", () => {
  it("lista as entradas com órgão, patógeno e exame", async () => {
    await fx.as(linked)
    const rows = await json<
      { id: string; status: string; pathogen: { id: string }; examType: { id: string } }[]
    >(await listProtocol(req(`/api/research/${main}/protocol`), withId(main)))
    expect(rows).toEqual([
      expect.objectContaining({
        id: mainProtocol,
        status: "ACTIVE",
        pathogen: expect.objectContaining({ id: cat.pathogenId }),
        examType: expect.objectContaining({ id: cat.examTypeId }),
      }),
    ])
  })
})

describe("PATCH/DELETE /api/research/[id]/protocol/[protocolId]", () => {
  const params = (id: string, protocolId: string) => ctx({ id, protocolId })
  const patch = (id: string, protocolId: string, body: unknown) =>
    patchProtocol(req(`/p/${protocolId}`, { method: "PATCH", body }), params(id, protocolId))
  const del = (id: string, protocolId: string) =>
    deleteProtocol(req(`/p/${protocolId}`, { method: "DELETE" }), params(id, protocolId))

  // Pesquisa própria do bloco: protocolo + amostra + análise da combinação.
  async function scenario() {
    const id = await fx.research(orgA, { createdById: creator, members: [creator, linked] })
    const protocol = await prisma.researchProtocol.create({
      data: {
        researchId: id,
        organId: cat.organId,
        pathogenId: cat.pathogenId,
        examTypeId: cat.examTypeId,
      },
      select: { id: true },
    })
    const animal = await fx.animal(orgA, id)
    const sampleId = await fx.sample(orgA, id, animal.id, cat.organId)
    const analysis = await prisma.analysis.create({
      data: {
        sampleId,
        pathogenId: cat.pathogenId,
        examTypeId: cat.examTypeId,
        result: "NEGATIVO",
      },
      select: { id: true },
    })
    return { id, protocolId: protocol.id, analysisId: analysis.id }
  }

  it("401 sem sessão nas duas operações", async () => {
    login(null)
    expect((await patch(main, mainProtocol, { status: "INACTIVE" })).status).toBe(401)
    expect((await del(main, mainProtocol)).status).toBe(401)
  })

  it("403 para quem não alcança a pesquisa (sem vínculo, outro grupo, admin global)", async () => {
    for (const who of [outsider, adminB, sysAdmin]) {
      await fx.as(who)
      expect((await patch(main, mainProtocol, { status: "INACTIVE" })).status).toBe(403)
      expect((await del(main, mainProtocol)).status).toBe(403)
    }
    expect(
      await prisma.researchProtocol.findUniqueOrThrow({ where: { id: mainProtocol } }),
    ).toMatchObject({ status: "ACTIVE" })
  })

  it("membro vinculado desativa e reativa; as análises ficam", async () => {
    const s = await scenario()
    await fx.as(linked)

    expect((await patch(s.id, s.protocolId, { status: "INACTIVE" })).status).toBe(204)
    const off = await prisma.researchProtocol.findUniqueOrThrow({ where: { id: s.protocolId } })
    expect(off.status).toBe("INACTIVE")
    expect(off.deactivatedAt).not.toBeNull()
    expect(await prisma.analysis.count({ where: { id: s.analysisId } })).toBe(1)

    expect((await patch(s.id, s.protocolId, { status: "ACTIVE" })).status).toBe(204)
    expect(
      await prisma.researchProtocol.findUniqueOrThrow({ where: { id: s.protocolId } }),
    ).toMatchObject({ status: "ACTIVE", deactivatedAt: null })
  })

  it("422 com status inválido; 404 quando a entrada é de outra pesquisa", async () => {
    await fx.as(linked)
    expect((await patch(main, mainProtocol, { status: "ARQUIVADO" })).status).toBe(422)

    const s = await scenario()
    const wrong = await patch(main, s.protocolId, { status: "INACTIVE" })
    expect(wrong.status).toBe(404)
    expect((await json<{ code: string }>(wrong)).code).toBe(ERROR_CODES.protocolNotFound)
    expect((await del(main, randomUUID())).status).toBe(404)
  })

  it("excluir é só do criador ou do admin: membro comum recebe 403", async () => {
    const s = await scenario()
    await fx.as(linked)
    const res = await del(s.id, s.protocolId)
    expect(res.status).toBe(403)
    expect(await prisma.researchProtocol.count({ where: { id: s.protocolId } })).toBe(1)
    expect(await prisma.analysis.count({ where: { id: s.analysisId } })).toBe(1)
  })

  it("o criador exclui a entrada e as análises da combinação", async () => {
    const s = await scenario()
    await fx.as(creator)
    expect((await del(s.id, s.protocolId)).status).toBe(204)
    expect(await prisma.researchProtocol.count({ where: { id: s.protocolId } })).toBe(0)
    expect(await prisma.analysis.count({ where: { id: s.analysisId } })).toBe(0)
  })

  it("o admin do grupo também exclui; o criador removido da pesquisa não", async () => {
    const s = await scenario()
    await prisma.researchMember.delete({
      where: { researchId_userId: { researchId: s.id, userId: creator } },
    })
    await fx.as(creator)
    expect((await del(s.id, s.protocolId)).status).toBe(403)

    await fx.as(adminA)
    expect((await del(s.id, s.protocolId)).status).toBe(204)
    expect(await prisma.researchProtocol.count({ where: { id: s.protocolId } })).toBe(0)
  })
})

describe("GET /api/research/[id]/results", () => {
  it("devolve protocolo, animais com amostras e análises da pesquisa", async () => {
    await fx.as(linked)
    const body = await json<{
      research: { id: string }
      protocol: { organId: string; status: string }[]
      animals: { id: string; controlId: string; samples: { id: string }[] }[]
      analyses: { result: string }[]
    }>(await getResults(req(`/api/research/${main}/results`), withId(main)))

    expect(body.research.id).toBe(main)
    expect(body.protocol).toEqual([
      expect.objectContaining({ organId: cat.organId, status: "ACTIVE" }),
    ])
    expect(body.animals).toHaveLength(1)
    expect(body.animals[0]).toMatchObject({ id: animalMain.id, controlId: animalMain.controlId })
    expect(body.animals[0]!.samples.map((s) => s.id)).toEqual([sampleMain])
    expect(body.analyses).toEqual([expect.objectContaining({ result: "POSITIVO" })])
  })
})

describe("Exportações por pesquisa", () => {
  const dwc = (id: string, query = "") =>
    exportDwc(req(`/api/research/${id}/export/darwin-core${query}`), withId(id))
  const xlsx = (id: string, query = "") =>
    exportXlsx(req(`/api/research/${id}/export/xlsx${query}`), withId(id))

  async function sheetText(res: Response, sheet: string): Promise<string> {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await res.arrayBuffer())
    const ws = wb.getWorksheet(sheet)
    if (!ws) throw new Error(`Aba "${sheet}" ausente. Abas: ${wb.worksheets.map((w) => w.name)}`)
    const cells: string[] = []
    ws.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value))))
    return cells.join("\n")
  }

  // Pesquisa com um indivíduo público, um privado e um oculto pela própria pesquisa.
  let exp: string
  let pub: { id: string; controlId: string }
  let priv: { id: string; controlId: string }
  let hidden: { id: string; controlId: string }

  beforeAll(async () => {
    exp = await fx.research(orgA, { createdById: creator, members: [creator, linked] })
    pub = await fx.animal(orgA, exp, { isPublic: true })
    priv = await fx.animal(orgA, exp, { species: "Pontoporia blainvillei" })
    hidden = await fx.animal(orgA, exp, { primaryHiddenAt: new Date() })
    const sampleId = await fx.sample(orgA, exp, pub.id, cat.organId)
    await prisma.analysis.create({
      data: {
        sampleId,
        pathogenId: cat.pathogenId,
        examTypeId: cat.examTypeId,
        result: "POSITIVO",
      },
    })
  })

  it("Darwin Core: pesquisa privada exporta todos os indivíduos não ocultos", async () => {
    await fx.as(linked)
    const res = await dwc(exp)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/xml")
    expect(res.headers.get("content-disposition")).toMatch(
      /attachment; filename="MARES-.+-darwincore\.xml"/,
    )
    const xml = await res.text()
    expect(xml).toContain("<dwr:SimpleDarwinRecordSet")
    expect(xml).toContain(`<dwc:occurrenceID>${pub.controlId}</dwc:occurrenceID>`)
    expect(xml).toContain(`<dwc:occurrenceID>${priv.controlId}</dwc:occurrenceID>`)
    expect(xml).not.toContain(hidden.controlId)
    expect(xml).toContain("<dwc:scientificName>Sotalia guianensis</dwc:scientificName>")
  })

  it("Darwin Core: o filtro `q` restringe os indivíduos exportados", async () => {
    await fx.as(linked)
    const xml = await (await dwc(exp, "?q=Pontoporia")).text()
    expect(xml).toContain(priv.controlId)
    expect(xml).not.toContain(pub.controlId)
  })

  it("XLSX: planilha abrível, com os indivíduos e as análises da pesquisa", async () => {
    await fx.as(linked)
    const res = await xlsx(exp)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="MARES-.+\.xlsx"/)

    const copy = res.clone()
    const animals = await sheetText(res, "Animais")
    expect(animals).toContain(pub.controlId)
    expect(animals).toContain(priv.controlId)
    expect(animals).not.toContain(hidden.controlId)

    const analyses = await sheetText(copy, "Análises")
    expect(analyses).toContain(pub.controlId)
  })

  it("pesquisa pública exporta só os indivíduos públicos (XML e XLSX)", async () => {
    await prisma.research.update({ where: { id: exp }, data: { isPublic: true } })
    try {
      await fx.as(linked)
      const xml = await (await dwc(exp)).text()
      expect(xml).toContain(pub.controlId)
      expect(xml).not.toContain(priv.controlId)

      const animals = await sheetText(await xlsx(exp), "Animais")
      expect(animals).toContain(pub.controlId)
      expect(animals).not.toContain(priv.controlId)
    } finally {
      await prisma.research.update({ where: { id: exp }, data: { isPublic: false } })
    }
  })

  describe("indivíduo compartilhado", () => {
    let guest: string

    beforeAll(async () => {
      guest = await fx.research(orgA, { createdById: creator, members: [creator, linked] })
      await prisma.animalResearch.create({
        data: { animalId: animalMain.id, researchId: guest, status: "ACCEPTED" },
      })
      await fx.sample(orgA, guest, animalMain.id, cat.organId)
    })

    it("a grade de resultados da pesquisa participante mostra o indivíduo", async () => {
      await fx.as(linked)
      const body = await json<{ animals: { id: string }[] }>(
        await getResults(req(`/api/research/${guest}/results`), withId(guest)),
      )
      expect(body.animals.map((a) => a.id)).toEqual([animalMain.id])
    })

    // BUG: as exportações filtram por `Animal.researchId` (pesquisa primária) e deixam de fora
    // o indivíduo compartilhado que a grade de resultados da MESMA pesquisa mostra.
    it.fails("Darwin Core da pesquisa participante inclui o indivíduo compartilhado", async () => {
      await fx.as(linked)
      const xml = await (await dwc(guest)).text()
      expect(xml).toContain(`<dwc:occurrenceID>${animalMain.controlId}</dwc:occurrenceID>`)
    })

    it.fails("XLSX da pesquisa participante inclui o indivíduo compartilhado", async () => {
      await fx.as(linked)
      const animals = await sheetText(await xlsx(guest), "Animais")
      expect(animals).toContain(animalMain.controlId)
    })
  })
})
