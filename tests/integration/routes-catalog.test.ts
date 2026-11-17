import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { ERROR_CODES } from "@/lib/error-codes"
import { ctx, json, login, req } from "./helpers/route"
import { createFixtures } from "./helpers/org-fixtures"

import { GET as listCatalog, POST as createItem } from "@/app/api/catalog/[type]/route"
import { PUT as updateItem, DELETE as deleteItem } from "@/app/api/catalog/[type]/[id]/route"
import { GET as itemUsage } from "@/app/api/catalog/[type]/[id]/usage/route"
import { GET as listGroups } from "@/app/api/catalog/pathogen-groups/route"

// Glossário global pelas rotas: ler é de qualquer autenticado; adicionar é de admin de grupo
// (ou admin global); editar/excluir é do admin global ou do AUTOR enquanto o item não é usado;
// excluir item em uso é barrado até para o admin global.

const fx = createFixtures("RotasGloss")

// Cada caso faz várias idas ao banco REMOTO de testes; o padrão de 5 s é curto para os mais longos.
vi.setConfig({ testTimeout: 30_000 })

let orgA: string
let orgB: string
let orgAdmin: string
let otherAdmin: string
let researcher: string
let sysAdmin: string
let sciGroup: string
let commonGroup: string
let used: Awaited<ReturnType<typeof fx.catalog>>
let usedResearch: string
let usedAnimal: string

type Row = { id: string; key: string; name: unknown; createdById: string | null; inUse: boolean }

const list = (type: string) => listCatalog(req(`/api/catalog/${type}`), ctx({ type }))
const create = (type: string, body: unknown) =>
  createItem(req(`/api/catalog/${type}`, { body }), ctx({ type }))
const update = (type: string, id: string, body: unknown) =>
  updateItem(req(`/api/catalog/${type}/${id}`, { method: "PUT", body }), ctx({ type, id }))
const remove = (type: string, id: string) =>
  deleteItem(req(`/api/catalog/${type}/${id}`, { method: "DELETE" }), ctx({ type, id }))
const usage = (type: string, id: string) =>
  itemUsage(req(`/api/catalog/${type}/${id}/usage`), ctx({ type, id }))

const names = (label: string) => {
  const n = fx.unique(label)
  return { namePt: n, nameEn: `${n} en` }
}

/** Cria um órgão pela rota em nome de `userId` e devolve a linha. */
async function organBy(userId: string): Promise<Row> {
  await fx.as(userId)
  const res = await create("organs", names("Órgão"))
  expect(res.status).toBe(201)
  return json<Row>(res)
}

beforeAll(async () => {
  orgA = await fx.org("Org A")
  orgB = await fx.org("Org B")
  orgAdmin = await fx.user({ memberships: [[orgA, "ORG_ADMIN"]] })
  otherAdmin = await fx.user({ memberships: [[orgB, "ORG_ADMIN"]] })
  researcher = await fx.user({ memberships: [[orgA, "RESEARCHER"]] })
  sysAdmin = await fx.user({ isSystemAdmin: true })

  // Itens EM USO: protocolo, amostra e análise de uma pesquisa do grupo A.
  used = await fx.catalog()
  sciGroup = used.groupId
  const common = await prisma.pathogenGroup.create({
    data: {
      key: `grp_comum_${fx.tag}`,
      name: { pt: `grp comum ${fx.tag}`, en: `common grp ${fx.tag}` },
      usesScientificName: false,
    },
    select: { id: true },
  })
  commonGroup = common.id
  fx.tracked.groups.add(commonGroup)

  usedResearch = await fx.research(orgA, { createdById: orgAdmin })
  await prisma.researchProtocol.create({
    data: {
      researchId: usedResearch,
      organId: used.organId,
      pathogenId: used.pathogenId,
      examTypeId: used.examTypeId,
    },
  })
  usedAnimal = (await fx.animal(orgA, usedResearch)).id
  const sampleId = await fx.sample(orgA, usedResearch, usedAnimal, used.organId)
  await prisma.analysis.create({
    data: { sampleId, pathogenId: used.pathogenId, examTypeId: used.examTypeId },
  })
})

afterAll(async () => {
  await fx.cleanup()
  await prisma.$disconnect()
})

describe("GET /api/catalog/[type]", () => {
  it.each(["organs", "pathogens", "exam-types", "systems"])("401 sem sessão (%s)", async (type) => {
    login(null)
    expect((await list(type)).status).toBe(401)
  })

  it("qualquer autenticado lê; o item em uso vem marcado", async () => {
    const free = await organBy(orgAdmin)
    await fx.as(researcher)
    const res = await list("organs")
    expect(res.status).toBe(200)
    const rows = await json<Row[]>(res)
    expect(rows.find((r) => r.id === used.organId)).toMatchObject({ inUse: true })
    expect(rows.find((r) => r.id === free.id)).toMatchObject({
      inUse: false,
      createdById: orgAdmin,
    })
  })

  it("patógenos trazem o grupo; exames e sistemas também são listados", async () => {
    await fx.as(researcher)
    const pathogens = await json<(Row & { group: { id: string } })[]>(await list("pathogens"))
    expect(pathogens.find((r) => r.id === used.pathogenId)).toMatchObject({
      inUse: true,
      group: { id: sciGroup },
    })
    const exams = await json<Row[]>(await list("exam-types"))
    expect(exams.find((r) => r.id === used.examTypeId)).toMatchObject({ inUse: true })
    expect((await list("systems")).status).toBe(200)
  })

  it("404 para catálogo inválido", async () => {
    await fx.as(researcher)
    const res = await list("organelas")
    expect(res.status).toBe(404)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.catalogNotFound)
  })
})

describe("POST /api/catalog/[type]", () => {
  it("401 sem sessão; 403 para pesquisador", async () => {
    const body = names("Sem permissão")
    login(null)
    expect((await create("organs", body)).status).toBe(401)
    await fx.as(researcher)
    expect((await create("organs", body)).status).toBe(403)
    expect(
      await prisma.organ.count({ where: { name: { path: ["pt"], equals: body.namePt } } }),
    ).toBe(0)
  })

  it("admin de grupo cria órgão com o nome aparado e chave derivada", async () => {
    await fx.as(orgAdmin)
    const body = names("Órgão novo")
    const res = await create("organs", { namePt: `  ${body.namePt} `, nameEn: body.nameEn })
    expect(res.status).toBe(201)
    const row = await json<Row>(res)
    expect(row).toMatchObject({
      name: { pt: body.namePt, en: body.nameEn },
      createdById: orgAdmin,
      inUse: false,
    })
    const db = await prisma.organ.findUniqueOrThrow({ where: { id: row.id } })
    expect(db.createdById).toBe(orgAdmin)
    expect(db.key).toMatch(/^[a-z0-9_]+$/)
  })

  it("admin global cria sistema de necrópsia", async () => {
    await fx.as(sysAdmin)
    const body = names("Sistema")
    const res = await create("systems", body)
    expect(res.status).toBe(201)
    const row = await json<Row>(res)
    expect(await prisma.necropsySystem.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      createdById: sysAdmin,
      name: { pt: body.namePt, en: body.nameEn },
    })
  })

  it("tipo de exame guarda a medida só quando PT e EN vêm preenchidos", async () => {
    await fx.as(orgAdmin)
    const full = await json<Row & { measureLabel: unknown; measureUnit: string | null }>(
      await create("exam-types", {
        ...names("Exame medido"),
        measurePt: "Ct",
        measureEn: "Ct",
        measureUnit: "ciclos",
      }),
    )
    expect(full).toMatchObject({ measureLabel: { pt: "Ct", en: "Ct" }, measureUnit: "ciclos" })

    const partial = await json<Row & { measureLabel: unknown; measureUnit: string | null }>(
      await create("exam-types", {
        ...names("Exame sem medida"),
        measurePt: "Ct",
        measureUnit: "x",
      }),
    )
    expect(partial).toMatchObject({ measureLabel: null, measureUnit: null })
    expect(
      (await prisma.examType.findUniqueOrThrow({ where: { id: partial.id } })).measureLabel,
    ).toBeNull()
  })

  it("patógeno científico exige seleção do NCBI (taxonId)", async () => {
    await fx.as(orgAdmin)
    const scientificName = `Testus ${fx.tag}us`
    const without = await create("pathogens", { groupId: sciGroup, scientificName })
    expect(without.status).toBe(422)
    expect((await json<{ code: string }>(without)).code).toBe(ERROR_CODES.pathogenNcbiRequired)
    expect(await prisma.pathogen.count({ where: { scientificName } })).toBe(0)

    const ok = await create("pathogens", {
      groupId: sciGroup,
      scientificName,
      taxonId: 987654,
      taxonRank: "Species",
      taxonFamily: "Testidae",
    })
    expect(ok.status).toBe(201)
    const row = await json<{ id: string }>(ok)
    expect(await prisma.pathogen.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      scientificName,
      name: null,
      taxonId: 987654,
      taxonRank: "species",
      taxonFamily: "Testidae",
      createdById: orgAdmin,
      groupId: sciGroup,
    })
  })

  it("patógeno de grupo de nome comum exige PT e EN e não guarda táxon", async () => {
    await fx.as(orgAdmin)
    const missing = await create("pathogens", { groupId: commonGroup, namePt: "Só PT" })
    expect(missing.status).toBe(422)
    expect((await json<{ code: string }>(missing)).code).toBe(ERROR_CODES.catalogNameRequired)

    const body = names("Rede de pesca")
    const ok = await create("pathogens", { groupId: commonGroup, ...body, taxonId: 5 })
    expect(ok.status).toBe(201)
    const row = await json<{ id: string }>(ok)
    expect(await prisma.pathogen.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      scientificName: null,
      name: { pt: body.namePt, en: body.nameEn },
      taxonId: null,
    })
  })

  it("404 para grupo de patógeno inexistente e para catálogo inválido", async () => {
    await fx.as(orgAdmin)
    const res = await create("pathogens", { groupId: randomUUID(), scientificName: "Nada" })
    expect(res.status).toBe(404)
    expect((await create("organelas", names("x"))).status).toBe(404)
  })

  it("422 com nome ausente ou longo demais", async () => {
    await fx.as(orgAdmin)
    expect((await create("organs", { namePt: "  ", nameEn: "x" })).status).toBe(422)
    expect((await create("organs", { namePt: "x".repeat(61), nameEn: "x" })).status).toBe(422)
    expect((await create("systems", null)).status).toBe(422)
  })

  it("409 para nome duplicado, mesmo com outra caixa", async () => {
    const first = await organBy(orgAdmin)
    const pt = (first.name as { pt: string }).pt
    await fx.as(otherAdmin)
    const res = await create("organs", { namePt: pt.toUpperCase(), nameEn: `${pt} outro` })
    expect(res.status).toBe(409)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.catalogDuplicate)
    expect(await prisma.organ.count({ where: { createdById: otherAdmin } })).toBe(0)
  })
})

describe("PUT /api/catalog/[type]/[id]", () => {
  it("401 sem sessão", async () => {
    login(null)
    expect((await update("organs", used.organId, names("x"))).status).toBe(401)
  })

  it("o autor edita o item enquanto não é usado", async () => {
    const item = await organBy(orgAdmin)
    const body = names("Órgão editado")
    const res = await update("organs", item.id, body)
    expect(res.status).toBe(200)
    expect(await json<Row>(res)).toMatchObject({ id: item.id, inUse: false })
    const db = await prisma.organ.findUniqueOrThrow({ where: { id: item.id } })
    expect(db.name).toEqual({ pt: body.namePt, en: body.nameEn })
    expect(db.key).toBe(item.key)
  })

  it("quem não é o autor (outro admin, pesquisador) recebe 403", async () => {
    const item = await organBy(orgAdmin)
    for (const who of [otherAdmin, researcher]) {
      await fx.as(who)
      expect((await update("organs", item.id, names("Invasão"))).status).toBe(403)
    }
    expect((await prisma.organ.findUniqueOrThrow({ where: { id: item.id } })).name).toEqual(
      item.name,
    )
  })

  it("item em uso: o autor perde a edição, o admin global mantém", async () => {
    const item = await organBy(orgAdmin)
    await fx.sample(orgA, usedResearch, usedAnimal, item.id)

    await fx.as(orgAdmin)
    expect((await update("organs", item.id, names("Tarde demais"))).status).toBe(403)

    await fx.as(sysAdmin)
    const body = names("Corrigido pela curadoria")
    const res = await update("organs", item.id, body)
    expect(res.status).toBe(200)
    expect(await json<Row>(res)).toMatchObject({ inUse: true })
    expect((await prisma.organ.findUniqueOrThrow({ where: { id: item.id } })).name).toEqual({
      pt: body.namePt,
      en: body.nameEn,
    })
  })

  it("admin global edita patógeno e tipo de exame", async () => {
    await fx.as(sysAdmin)
    const scientificName = `Editatus ${fx.tag}us`
    const p = await update("pathogens", used.pathogenId, {
      groupId: sciGroup,
      scientificName,
      taxonId: 42,
    })
    expect(p.status).toBe(200)
    expect(
      await prisma.pathogen.findUniqueOrThrow({ where: { id: used.pathogenId } }),
    ).toMatchObject({ scientificName, taxonId: 42 })

    const body = names("Exame editado")
    const e = await update("exam-types", used.examTypeId, {
      ...body,
      measurePt: "Título",
      measureEn: "Titer",
    })
    expect(e.status).toBe(200)
    expect(
      await prisma.examType.findUniqueOrThrow({ where: { id: used.examTypeId } }),
    ).toMatchObject({
      name: { pt: body.namePt, en: body.nameEn },
      measureLabel: { pt: "Título", en: "Titer" },
    })
  })

  it("422 com corpo inválido; 409 ao renomear para um nome que já existe", async () => {
    const a = await organBy(orgAdmin)
    const b = await organBy(orgAdmin)
    expect((await update("organs", a.id, { namePt: "", nameEn: "" })).status).toBe(422)

    const taken = b.name as { pt: string; en: string }
    const res = await update("organs", a.id, { namePt: taken.pt, nameEn: `${taken.en} x` })
    expect(res.status).toBe(409)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.catalogDuplicate)
    expect((await prisma.organ.findUniqueOrThrow({ where: { id: a.id } })).name).toEqual(a.name)
  })

  it("404 para item inexistente e para catálogo inválido", async () => {
    await fx.as(sysAdmin)
    expect((await update("organs", randomUUID(), names("x"))).status).toBe(404)
    expect((await update("organelas", used.organId, names("x"))).status).toBe(404)
    // O id existe, mas em OUTRO catálogo.
    expect((await update("systems", used.organId, names("x"))).status).toBe(404)
  })
})

describe("DELETE /api/catalog/[type]/[id]", () => {
  it("401 sem sessão", async () => {
    login(null)
    expect((await remove("organs", used.organId)).status).toBe(401)
  })

  it("o autor exclui o item não usado", async () => {
    const item = await organBy(orgAdmin)
    const res = await remove("organs", item.id)
    expect(res.status).toBe(204)
    expect(await prisma.organ.count({ where: { id: item.id } })).toBe(0)
  })

  it("quem não é o autor recebe 403 e o item permanece", async () => {
    const item = await organBy(orgAdmin)
    for (const who of [otherAdmin, researcher]) {
      await fx.as(who)
      expect((await remove("organs", item.id)).status).toBe(403)
    }
    expect(await prisma.organ.count({ where: { id: item.id } })).toBe(1)
  })

  it.each([
    ["organs", () => used.organId],
    ["pathogens", () => used.pathogenId],
    ["exam-types", () => used.examTypeId],
  ])("409 para item em uso, mesmo sendo admin global (%s)", async (type, id) => {
    await fx.as(sysAdmin)
    const res = await remove(type, id())
    expect(res.status).toBe(409)
    expect((await json<{ code: string }>(res)).code).toBe(ERROR_CODES.catalogInUse)
  })

  it("sistema citado por um laudo não é excluído; livre, o admin global exclui", async () => {
    await fx.as(sysAdmin)
    const sys = await json<Row>(await create("systems", names("Sistema em laudo")))
    await prisma.necropsySystemExam.create({
      data: { animalId: usedAnimal, systemId: sys.id, position: 0 },
    })
    expect((await remove("systems", sys.id)).status).toBe(409)
    expect(await prisma.necropsySystem.count({ where: { id: sys.id } })).toBe(1)

    await prisma.necropsySystemExam.deleteMany({ where: { systemId: sys.id } })
    expect((await remove("systems", sys.id)).status).toBe(204)
    expect(await prisma.necropsySystem.count({ where: { id: sys.id } })).toBe(0)
  })

  it("404 para item inexistente e para catálogo inválido", async () => {
    await fx.as(sysAdmin)
    expect((await remove("organs", randomUUID())).status).toBe(404)
    expect((await remove("organelas", used.organId)).status).toBe(404)
  })
})

describe("GET /api/catalog/[type]/[id]/usage", () => {
  it("401 sem sessão; 403 para quem não é admin global", async () => {
    login(null)
    expect((await usage("organs", used.organId)).status).toBe(401)
    for (const who of [orgAdmin, researcher]) {
      await fx.as(who)
      expect((await usage("organs", used.organId)).status).toBe(403)
    }
  })

  it("conta pesquisas e grupos distintos que usam órgão, patógeno e exame", async () => {
    // Segundo grupo usando o mesmo órgão, só por protocolo.
    const researchB = await fx.research(orgB, { createdById: otherAdmin })
    const other = await fx.catalog()
    await prisma.researchProtocol.create({
      data: {
        researchId: researchB,
        organId: used.organId,
        pathogenId: other.pathogenId,
        examTypeId: other.examTypeId,
      },
    })

    await fx.as(sysAdmin)
    const organ = await usage("organs", used.organId)
    expect(organ.status).toBe(200)
    expect(await json(organ)).toEqual({ researches: 2, orgs: 2 })
    expect(await json(await usage("pathogens", used.pathogenId))).toEqual({
      researches: 1,
      orgs: 1,
    })
    expect(await json(await usage("exam-types", used.examTypeId))).toEqual({
      researches: 1,
      orgs: 1,
    })
  })

  it("item sem uso devolve zero; catálogo inválido é 404", async () => {
    const free = await organBy(orgAdmin)
    await fx.as(sysAdmin)
    expect(await json(await usage("organs", free.id))).toEqual({ researches: 0, orgs: 0 })
    expect((await usage("organelas", free.id)).status).toBe(404)
  })

  // BUG: catalogUsageBreakdown não trata "systems" (cai no ramo de tipo de exame) e devolve
  // 0/0 para um sistema citado em laudo — o mesmo item que a exclusão recusa por estar em uso.
  it.fails("sistema de necrópsia citado por um laudo aparece como em uso", async () => {
    await fx.as(sysAdmin)
    const sys = await json<Row>(await create("systems", names("Sistema usado")))
    await prisma.necropsySystemExam.create({
      data: { animalId: usedAnimal, systemId: sys.id, position: 1 },
    })
    const res = await usage("systems", sys.id)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ researches: 1, orgs: 1 })
  })
})

describe("GET /api/catalog/pathogen-groups", () => {
  it("401 sem sessão", async () => {
    login(null)
    expect((await listGroups()).status).toBe(401)
  })

  it("qualquer autenticado lê os grupos, com a regra do nome científico", async () => {
    await fx.as(researcher)
    const res = await listGroups()
    expect(res.status).toBe(200)
    const rows = await json<{ id: string; usesScientificName: boolean }[]>(res)
    expect(rows.find((g) => g.id === sciGroup)).toMatchObject({ usesScientificName: true })
    expect(rows.find((g) => g.id === commonGroup)).toMatchObject({ usesScientificName: false })
  })
})
