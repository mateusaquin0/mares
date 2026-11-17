import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import ExcelJS from "exceljs"
import { prisma } from "@/lib/prisma"
import { MEDIA_BUCKET } from "@/lib/media"
import type { AuthUser } from "@/lib/auth"
import { ctx, json, login, member, req } from "./helpers/route"
import { fakeSupabase } from "./helpers/supabase-fake"
import {
  DENIED,
  auditOf,
  deniedStatuses,
  destroyWorld,
  makeAnimal,
  makeMedia,
  makeSample,
  makeScreening,
  makeShare,
  newWorld,
  seedWorld,
} from "./helpers/animals-world"

// Rotas do INDIVÍDUO, chamadas pelos handlers reais contra o banco de testes:
//   GET/POST       /api/animals            (listagem paginada/filtrada e cadastro)
//   GET            /api/animals/facets     (valores dos filtros)
//   GET            /api/animals/lookup     (consulta prévia de identificador)
//   POST           /api/animals/export     (Darwin Core / Excel por seleção)
//   GET/PUT/DELETE /api/animals/[id]
//   GET            /api/animals/[id]/audit (timeline)
//   GET            /api/animals/[id]/grid  (grade de análises)
//
// O que protegem: o pesquisador só alcança indivíduos das pesquisas que integra (primária ou
// participação ACEITA) e, num indivíduo compartilhado, só as amostras/arquivos/análises da SUA
// pesquisa; identificadores são únicos por organização e o conflito diz onde está o registro;
// só o admin mexe em `isPublic`; não se exclui indivíduo com amostras nem — sendo pesquisador
// — indivíduo compartilhado; a exclusão leva os arquivos do Storage; edições são auditadas.

import { GET as listAnimals, POST as createAnimal } from "@/app/api/animals/route"
import { GET as getFacets } from "@/app/api/animals/facets/route"
import { GET as lookupAnimal } from "@/app/api/animals/lookup/route"
import { POST as exportAnimals } from "@/app/api/animals/export/route"
import {
  GET as getAnimal,
  PUT as updateAnimal,
  DELETE as deleteAnimal,
} from "@/app/api/animals/[id]/route"
import { GET as getAudit } from "@/app/api/animals/[id]/audit/route"
import { GET as getGrid } from "@/app/api/animals/[id]/grid/route"
import { PUT as putAnalysis } from "@/app/api/analyses/route"

vi.setConfig({ testTimeout: 30_000 })

const w = newWorld("RAM")

type ErrorBody = { code: string; params?: Record<string, string> }
type ListItem = {
  id: string
  controlId: string | null
  species: string | null
  isPublic: boolean
  research: { id: string }
  researches: { id: string }[]
  positivePathogens: string[]
  _count: { samples: number }
}
type ListBody = { items: ListItem[]; total: number; page: number; pageSize: number }
type FacetsBody = {
  species: string[]
  states: string[]
  researches: { id: string; name: string }[]
  pathogens: { id: string; label: string }[]
}

// Indivíduos fixos da listagem/facetas/exportação. O município é a marca que isola este
// conjunto dos indivíduos que os demais testes do arquivo criam na mesma organização.
const marker = `Listagem ${w.tag}`
let a1: { id: string; controlId: string } // P · público · amostra com rastreio POSITIVO
let a2: { id: string; controlId: string } // P · privado · sem amostras
let a3: { id: string; controlId: string } // Q · sem data de encalhe
let shared: { id: string; controlId: string } // primária P, compartilhado (aceito) com Q
let sharedSampleP: { id: string; identification: string } // amostra de P (positiva) no compartilhado
let foreign: { id: string; controlId: string } // organização B
const simbaOfA1 = `SIMBA-${w.tag}-A1`

const list = (query = "") =>
  listAnimals(req(`/api/animals?q=${encodeURIComponent(marker)}${query}`))
const page = async (query = "") => json<ListBody>(await list(query))
const idsOf = async (query = "") => (await page(query)).items.map((i) => i.id)
const sorted = (ids: string[]) => [...ids].sort()

const create = (body: unknown) => createAnimal(req("/api/animals", { body }))
const detail = (id: string) => getAnimal(req(`/api/animals/${id}`), ctx({ id }))
const update = (id: string, body: unknown) =>
  updateAnimal(req(`/api/animals/${id}`, { method: "PUT", body }), ctx({ id }))
const remove = (id: string) =>
  deleteAnimal(req(`/api/animals/${id}`, { method: "DELETE" }), ctx({ id }))
const exportOf = (ids: string[], format = "darwin-core") =>
  exportAnimals(req("/api/animals/export", { body: { ids, format } }))
const lookup = (query: string) => lookupAnimal(req(`/api/animals/lookup?${query}`))
const audit = (id: string) => getAudit(req(`/api/animals/${id}/audit`), ctx({ id }))
const grid = (id: string) => getGrid(req(`/api/animals/${id}/grid`), ctx({ id }))

const exists = async (id: string) => (await prisma.animal.count({ where: { id } })) === 1
const newControlId = (what: string) => `${w.tag}-NOVO-${what}`
const validAnimal = (researchId: string, controlId: string) => ({
  researchId,
  controlId,
  sex: "M",
  lifeStage: "JUVENILE",
  species: "Sotalia guianensis",
})

/** Linhas de uma aba do Excel exportado, como objetos cabeçalho → valor. */
async function sheetRows(res: Response, sheet: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await res.arrayBuffer())
  const ws = wb.getWorksheet(sheet)
  if (!ws) throw new Error(`aba "${sheet}" ausente`)
  const headers = (ws.getRow(1).values as unknown[]).map((v) => String(v ?? ""))
  const rows: Record<string, unknown>[] = []
  ws.eachRow((row, n) => {
    if (n === 1) return
    const values = row.values as unknown[]
    rows.push(Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]).filter(([h]) => h)))
  })
  return rows
}

beforeAll(async () => {
  await seedWorld(w)
  a1 = await makeAnimal(w, w.researchP, {
    municipality: marker,
    state: "SC",
    eventDate: new Date("2026-03-10"),
    isPublic: true,
    simbaRecordNumber: simbaOfA1,
  })
  a2 = await makeAnimal(w, w.researchP, {
    municipality: marker,
    species: "Tursiops truncatus",
    sex: "M",
    lifeStage: "JUVENILE",
    state: "PR",
    eventDate: new Date("2026-01-05"),
    isPublic: false,
  })
  a3 = await makeAnimal(w, w.researchQ, {
    municipality: marker,
    species: "Pontoporia blainvillei",
    state: "RS",
    isPublic: true,
  })
  shared = await makeAnimal(w, w.researchP, {
    municipality: marker,
    species: "Stenella frontalis",
    state: "SP",
    eventDate: new Date("2026-02-20"),
    isPublic: true,
  })
  await makeShare(shared.id, w.researchQ)
  foreign = await makeAnimal(w, w.researchB, { municipality: marker, species: "Orcinus orca" })

  await makeScreening(w, (await makeSample(w, a1.id, w.researchP)).id, "POSITIVO")
  sharedSampleP = await makeSample(w, shared.id, w.researchP)
  await makeScreening(w, sharedSampleP.id, "POSITIVO")
})

afterAll(async () => {
  fakeSupabase.reset()
  await destroyWorld(w)
})

describe("GET /api/animals — listagem", () => {
  it("admin vê todos os indivíduos da organização, com pesquisas, amostras e patógenos positivos", async () => {
    login(w.as.adminA)
    const res = await list()
    expect(res.status).toBe(200)
    const body = await json<ListBody>(res)
    expect(body).toMatchObject({ total: 4, page: 1, pageSize: 20 })
    expect(sorted(body.items.map((i) => i.id))).toEqual(sorted([a1.id, a2.id, a3.id, shared.id]))

    const first = body.items.find((i) => i.id === a1.id)!
    expect(first).toMatchObject({
      controlId: a1.controlId,
      isPublic: true,
      research: { id: w.researchP },
      positivePathogens: [w.name("Pat")],
      _count: { samples: 1 },
    })
    const both = body.items.find((i) => i.id === shared.id)!
    expect(sorted(both.researches.map((r) => r.id))).toEqual(sorted([w.researchP, w.researchQ]))
    expect(body.items.find((i) => i.id === a2.id)).toMatchObject({
      positivePathogens: [],
      _count: { samples: 0 },
    })
  })

  it("pesquisador vê só os indivíduos das suas pesquisas (primária ou participação aceita)", async () => {
    login(w.as.resP)
    expect(sorted(await idsOf())).toEqual(sorted([a1.id, a2.id, shared.id]))
    login(w.as.resQ)
    expect(sorted(await idsOf())).toEqual(sorted([a3.id, shared.id]))
    login(w.as.resPQ)
    expect(await idsOf()).toHaveLength(4)
  })

  it("quem não tem pesquisa, outra organização e o admin global não recebem nenhum deles", async () => {
    login(w.as.outsider)
    expect(await page()).toMatchObject({ items: [], total: 0 })
    login(w.as.adminB)
    expect(await idsOf()).toEqual([foreign.id])
    login(w.as.sysAdmin) // sem organização ativa
    expect(await page()).toEqual({ items: [], total: 0, page: 1, pageSize: 20 })
  })

  it("sem sessão responde 401; organização ativa de que não se é membro, 403", async () => {
    login(null)
    expect((await list()).status).toBe(401)
    login(w.as.adminB, w.orgA)
    expect((await list()).status).toBe(403)
  })

  it.each([
    ["espécie", () => "&species=Tursiops%20truncatus", () => [a2.id]],
    ["sexo", () => "&sex=M", () => [a2.id]],
    ["estágio de vida", () => "&lifeStage=JUVENILE", () => [a2.id]],
    ["UF (lista separada por vírgula)", () => "&state=SC,RS", () => [a1.id, a3.id]],
    [
      "pesquisa, contando a participação",
      () => `&research=${w.researchQ}`,
      () => [a3.id, shared.id],
    ],
    ["patógeno positivo", () => `&pathogen=${w.pathogenId}`, () => [a1.id, shared.id]],
    ["com amostras", () => "&samples=with", () => [a1.id, shared.id]],
    ["sem amostras", () => "&samples=without", () => [a2.id, a3.id]],
    // Público de fato = indivíduo público E pesquisa pública (só P é pública).
    ["visibilidade pública efetiva", () => "&visibility=public", () => [a1.id, shared.id]],
    ["visibilidade privada", () => "&visibility=private", () => [a2.id, a3.id]],
    ["período do encalhe", () => "&from=2026-02-01&to=2026-03-10", () => [a1.id, shared.id]],
  ])("filtra por %s", async (_name, query, expected) => {
    login(w.as.adminA)
    const body = await page(query())
    expect(sorted(body.items.map((i) => i.id))).toEqual(sorted(expected()))
    expect(body.total).toBe(expected().length)
  })

  it("busca textual acha pelo ID de controle", async () => {
    login(w.as.adminA)
    const res = await listAnimals(req(`/api/animals?q=${encodeURIComponent(a2.controlId)}`))
    expect((await json<ListBody>(res)).items.map((i) => i.id)).toEqual([a2.id])
  })

  it("ordena no servidor (data desc por padrão, sem data por último) e pagina", async () => {
    login(w.as.adminA)
    expect(await idsOf()).toEqual([a1.id, shared.id, a2.id, a3.id])
    expect(await idsOf("&sort=species&dir=asc")).toEqual([a3.id, a1.id, shared.id, a2.id])

    const second = await page("&page=2&pageSize=10")
    expect(second).toMatchObject({ items: [], total: 4, page: 2, pageSize: 10 })
    // Tamanho de página fora da lista cai no padrão.
    expect((await page("&pageSize=500")).pageSize).toBe(20)
  })

  it("idsOnly devolve só os ids do filtro, respeitando o escopo", async () => {
    login(w.as.resQ)
    const res = await list("&idsOnly=1")
    expect(sorted((await json<{ ids: string[] }>(res)).ids)).toEqual(sorted([a3.id, shared.id]))
    login(w.as.outsider)
    expect(await json(await list("&idsOnly=1"))).toEqual({ ids: [] })
  })

  // BUG: no indivíduo compartilhado, a linha da listagem conta as amostras e lista os patógenos
  // positivos de TODAS as pesquisas. O pesquisador de Q (que não tem amostra nenhuma ali) vê
  // "1 amostra" e o patógeno positivo da pesquisa P — dado que o detalhe e a grade lhe escondem.
  it.fails(
    "no compartilhado, amostras e positivos da linha são só os da pesquisa de quem lista",
    async () => {
      login(w.as.resQ)
      const row = (await page()).items.find((i) => i.id === shared.id)!
      expect(row._count.samples).toBe(0)
      expect(row.positivePathogens).toEqual([])
    },
  )

  // BUG: mesmo vazamento pelo filtro — filtrar por patógeno positivo devolve o indivíduo
  // compartilhado ao pesquisador de Q, revelando o resultado obtido pela pesquisa P.
  it.fails("o filtro por patógeno positivo não revela resultado de outra pesquisa", async () => {
    login(w.as.resQ)
    expect(await idsOf(`&pathogen=${w.pathogenId}`)).toEqual([])
  })
})

describe("GET /api/animals/facets", () => {
  const facets = async (user: AuthUser | null, orgId?: string) => {
    login(user, orgId)
    const res = await getFacets()
    return { status: res.status, body: res.status === 200 ? await json<FacetsBody>(res) : null }
  }

  it("admin recebe espécies, UFs, pesquisas e patógenos positivos de toda a organização", async () => {
    const { status, body } = await facets(w.as.adminA)
    expect(status).toBe(200)
    expect(body!.species).toEqual(
      expect.arrayContaining([
        "Pontoporia blainvillei",
        "Sotalia guianensis",
        "Stenella frontalis",
        "Tursiops truncatus",
      ]),
    )
    expect(body!.species).not.toContain("Orcinus orca")
    expect(body!.states).toEqual(expect.arrayContaining(["PR", "RS", "SC", "SP"]))
    expect(sorted(body!.researches.map((r) => r.id))).toEqual(sorted([w.researchP, w.researchQ]))
    expect(body!.pathogens).toEqual([{ id: w.pathogenId, label: w.name("Pat") }])
  })

  it("pesquisador recebe só o que existe nas suas pesquisas", async () => {
    const { body } = await facets(w.as.resQ)
    expect(sorted(body!.species)).toEqual(["Pontoporia blainvillei", "Stenella frontalis"])
    expect(sorted(body!.states)).toEqual(["RS", "SP"])
    expect(body!.researches.map((r) => r.id)).toEqual([w.researchQ])
  })

  it("sem pesquisa, sem organização ativa ou de outra organização, nada da org A aparece", async () => {
    const empty = { species: [], states: [], researches: [], pathogens: [] }
    expect((await facets(w.as.outsider)).body).toEqual(empty)
    expect((await facets(w.as.sysAdmin)).body).toEqual(empty)
    const other = (await facets(w.as.adminB)).body!
    expect(other.species).toContain("Orcinus orca")
    expect(other.species).not.toContain("Tursiops truncatus")
    expect(other.researches.map((r) => r.id)).toEqual([w.researchB])
  })

  it("sem sessão responde 401; organização ativa de que não se é membro, 403", async () => {
    expect((await facets(null)).status).toBe(401)
    expect((await facets(w.as.adminB, w.orgA)).status).toBe(403)
  })

  // BUG: a faceta de patógenos procura análises positivas em QUALQUER amostra dos indivíduos
  // visíveis. O pesquisador de Q recebe o patógeno que só deu positivo em amostra da pesquisa P.
  it.fails(
    "a faceta de patógenos só traz positivos de amostras das pesquisas do usuário",
    async () => {
      const { body } = await facets(w.as.resQ)
      expect(body!.pathogens).toEqual([])
    },
  )
})

describe("GET /api/animals/lookup — consulta prévia de identificador", () => {
  it("identificador livre responde found:false", async () => {
    login(w.as.resP)
    const res = await lookup(`controlId=${w.tag}-LIVRE`)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ found: false })
  })

  it("registro visível: nomeia a pesquisa, devolve o id e a situação na pesquisa de destino", async () => {
    const pendingAnimal = await makeAnimal(w, w.researchP)
    await makeShare(pendingAnimal.id, w.researchQ, { status: "PENDING" })

    login(w.as.resPQ)
    const linked = await lookup(`controlId=${a1.controlId}&researchId=${w.researchP}`)
    expect(await json(linked)).toEqual({
      found: true,
      visible: true,
      animalId: a1.id,
      research: w.name("Pesquisa P"),
      link: "linked",
    })
    const link = async (controlId: string, researchId: string) =>
      (
        await json<{ link: string }>(
          await lookup(`controlId=${controlId}&researchId=${researchId}`),
        )
      ).link
    expect(await link(a1.controlId, w.researchQ)).toBe("none")
    expect(await link(shared.controlId, w.researchQ)).toBe("linked")
    expect(await link(pendingAnimal.controlId, w.researchQ)).toBe("pending")
    // Pelo número do SIMBA, e sem pesquisa de destino.
    expect(await json(await lookup(`simbaRecordNumber=${simbaOfA1}`))).toMatchObject({
      found: true,
      animalId: a1.id,
      link: "none",
    })
  })

  it("registro fora do escopo: só a identidade mínima, para decidir entre pedir e corrigir", async () => {
    login(w.as.resQ)
    const res = await lookup(`controlId=${a1.controlId}&researchId=${w.researchQ}`)
    expect(await json(res)).toEqual({
      found: true,
      visible: false,
      animalId: a1.id,
      research: w.name("Pesquisa P"),
      species: "Sotalia guianensis",
      eventDate: new Date("2026-03-10").toISOString(),
      location: `${marker}, SC`,
    })
  })

  it("o identificador é procurado só na organização ativa", async () => {
    login(w.as.adminB)
    expect(await json(await lookup(`controlId=${a1.controlId}`))).toEqual({ found: false })
    expect(await json(await lookup(`controlId=${foreign.controlId}`))).toMatchObject({
      found: true,
      animalId: foreign.id,
    })
  })

  it("exige um identificador (422), sessão (401) e vínculo com a organização ativa", async () => {
    login(w.as.resP)
    const res = await lookup("researchId=x")
    expect(res.status).toBe(422)
    expect((await json<ErrorBody>(res)).code).toBe("validation")
    login(null)
    expect((await lookup(`controlId=${a1.controlId}`)).status).toBe(401)
    login(w.as.sysAdmin)
    expect((await lookup(`controlId=${a1.controlId}`)).status).toBe(401)
    login(w.as.adminB, w.orgA)
    expect((await lookup(`controlId=${a1.controlId}`)).status).toBe(403)
  })

  it("limita a cadência por usuário: a 61ª consulta no minuto responde 429", async () => {
    // Usuário só deste teste: o limite é em memória e por id.
    login(member(randomUUID(), [w.orgA, "ORG_ADMIN"]))
    for (let i = 0; i < 60; i++) {
      expect((await lookup(`controlId=${w.tag}-RL`)).status).toBe(200)
    }
    const blocked = await lookup(`controlId=${a1.controlId}`)
    expect(blocked.status).toBe(429)
    expect((await json<ErrorBody>(blocked)).code).toBe("rateLimited")
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0)
  })
})

describe("POST /api/animals/export — exportação por seleção", () => {
  it("Darwin Core: devolve o XML dos indivíduos escolhidos como anexo", async () => {
    login(w.as.adminA)
    const res = await exportOf([a1.id, a2.id])
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("application/xml")
    expect(res.headers.get("Content-Disposition")).toMatch(
      /attachment; filename="MARES-animais-.+\.xml"/,
    )
    const xml = await res.text()
    expect(xml).toContain(`<dwc:occurrenceID>${a1.controlId}</dwc:occurrenceID>`)
    expect(xml).toContain(`<dwc:catalogNumber>${simbaOfA1}</dwc:catalogNumber>`)
    expect(xml).toContain(a2.controlId)
    expect(xml).not.toContain(a3.controlId)
  })

  it("só exporta o que quem pede enxerga, mesmo com ids alheios na seleção", async () => {
    const all = [a1.id, a2.id, a3.id, shared.id, foreign.id]
    login(w.as.resQ)
    const mine = await (await exportOf(all)).text()
    expect(mine).toContain(a3.controlId)
    expect(mine).toContain(shared.controlId)
    expect(mine).not.toContain(a1.controlId)
    expect(mine).not.toContain(foreign.controlId)

    for (const user of [w.as.outsider, w.as.adminB]) {
      login(user)
      const res = await exportOf([a1.id, shared.id])
      expect(res.status).toBe(200)
      const xml = await res.text()
      expect(xml).not.toContain(a1.controlId)
      expect(xml).not.toContain(shared.controlId)
    }
  })

  it("indivíduo que a pesquisa ocultou não entra na exportação dela", async () => {
    const hidden = await makeAnimal(w, w.researchP)
    await makeShare(hidden.id, w.researchQ, { hiddenAt: new Date() })
    login(w.as.resQ)
    expect(await (await exportOf([hidden.id])).text()).not.toContain(hidden.controlId)
    login(w.as.resP)
    expect(await (await exportOf([hidden.id])).text()).toContain(hidden.controlId)
  })

  it("Excel: abas de indivíduos e de análises com os dados da seleção", async () => {
    login(w.as.adminA)
    const res = await exportOf([a1.id, shared.id], "xlsx")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml")
    expect(res.headers.get("Content-Disposition")).toMatch(/filename="MARES-animais-.+\.xlsx"/)

    const copy = res.clone()
    const animals = await sheetRows(res, "Animais")
    expect(sorted(animals.map((r) => String(r["ID de controle"])))).toEqual(
      sorted([a1.controlId, shared.controlId]),
    )
    const row = animals.find((r) => r["ID de controle"] === shared.controlId)!
    expect(row).toMatchObject({
      Espécie: "Stenella frontalis",
      Pesquisa: w.name("Pesquisa P"),
      Amostras: 1,
      "Patógenos positivos": w.name("Pat"),
    })

    const analyses = await sheetRows(copy, "Análises")
    expect(analyses.map((r) => r["Amostra"])).toContain(sharedSampleP.identification)
  })

  it("Excel do compartilhado: as análises da outra pesquisa não vão para a planilha", async () => {
    login(w.as.resQ)
    const res = await exportOf([shared.id], "xlsx")
    const copy = res.clone()
    expect((await sheetRows(res, "Animais")).map((r) => r["ID de controle"])).toEqual([
      shared.controlId,
    ])
    expect(await sheetRows(copy, "Análises")).toEqual([])
  })

  // BUG: as amostras e análises da planilha são filtradas pela pesquisa de quem exporta, mas a
  // coluna "Amostras" usa a contagem total do indivíduo — o pesquisador de Q lê "1" num
  // indivíduo em que a sua pesquisa não tem amostra, revelando o volume de dados da pesquisa P.
  it.fails(
    "Excel do compartilhado: a coluna Amostras conta só as da pesquisa de quem exporta",
    async () => {
      login(w.as.resQ)
      const rows = await sheetRows(await exportOf([shared.id], "xlsx"), "Animais")
      expect(rows[0]!["Amostras"]).toBe(0)
    },
  )

  it("valida o corpo (422) e exige sessão e organização ativa (401)", async () => {
    login(w.as.adminA)
    for (const body of [
      { ids: [], format: "xlsx" },
      { ids: [a1.id], format: "csv" },
      { format: "xlsx" },
    ]) {
      const res = await exportAnimals(req("/api/animals/export", { body }))
      expect(res.status).toBe(422)
      expect((await json<ErrorBody>(res)).code).toBe("validation")
    }
    login(null)
    expect((await exportOf([a1.id])).status).toBe(401)
    login(w.as.sysAdmin)
    expect((await exportOf([a1.id])).status).toBe(401)
    login(w.as.adminB, w.orgA)
    expect((await exportOf([a1.id])).status).toBe(403)
  })
})

describe("POST /api/animals — cadastro", () => {
  it("pesquisador cadastra na sua pesquisa; o indivíduo nasce público mesmo que peça o contrário", async () => {
    login(w.as.resP)
    const controlId = newControlId("A")
    const res = await create({
      ...validAnimal(w.researchP, `  ${controlId}  `),
      isPublic: false, // só o admin decide a visibilidade
      eventDate: "2026-05-02",
      strandingLat: -26.9,
      strandingLon: -48.6,
      municipality: "Itajaí",
      state: "SC",
      necropsyWeightKg: 42.5,
    })
    expect(res.status).toBe(201)
    const body = await json<{ id: string; species: string }>(res)
    expect(body.species).toBe("Sotalia guianensis")

    const row = await prisma.animal.findUniqueOrThrow({ where: { id: body.id } })
    expect(row).toMatchObject({
      controlId,
      researchId: w.researchP,
      orgId: w.orgA,
      isPublic: true,
      source: "manual",
      sex: "M",
      lifeStage: "JUVENILE",
      strandingLat: -26.9,
      strandingLon: -48.6,
      municipality: "Itajaí",
      necropsyWeightKg: 42.5,
    })
    expect(row.eventDate?.toISOString().slice(0, 10)).toBe("2026-05-02")
  })

  it("admin cadastra em qualquer pesquisa e pode ocultar; com nº SIMBA a origem é 'simba'", async () => {
    login(w.as.adminA)
    const res = await create({
      ...validAnimal(w.researchQ, newControlId("B")),
      species: null, // espécie indeterminada
      simbaRecordNumber: `SIMBA-${w.tag}-B`,
      isPublic: false,
    })
    expect(res.status).toBe(201)
    const { id } = await json<{ id: string }>(res)
    expect(await prisma.animal.findUniqueOrThrow({ where: { id } })).toMatchObject({
      researchId: w.researchQ,
      species: null,
      isPublic: false,
      source: "simba",
    })
  })

  it("pesquisador não cadastra em pesquisa que não integra; pesquisa de fora da organização é 404", async () => {
    login(w.as.resP)
    const controlId = newControlId("C")
    expect((await create(validAnimal(w.researchQ, controlId))).status).toBe(403)
    login(w.as.outsider)
    expect((await create(validAnimal(w.researchP, controlId))).status).toBe(403)

    login(w.as.adminA)
    for (const researchId of [w.researchB, randomUUID()]) {
      const res = await create(validAnimal(researchId, controlId))
      expect(res.status).toBe(404)
      expect((await json<ErrorBody>(res)).code).toBe("researchNotFound")
    }
    login(w.as.adminB) // a pesquisa P não é da organização dele
    expect((await create(validAnimal(w.researchP, controlId))).status).toBe(404)
    expect(await prisma.animal.count({ where: { controlId } })).toBe(0)
  })

  it("ID de controle repetido numa pesquisa visível: 409 dizendo onde está e se já está vinculado", async () => {
    login(w.as.resPQ)
    const before = await prisma.animal.count({ where: { orgId: w.orgA } })
    const same = await create(validAnimal(w.researchP, a1.controlId))
    expect(same.status).toBe(409)
    expect(await json<ErrorBody>(same)).toMatchObject({
      code: "animalControlDuplicateInResearch",
      params: { research: w.name("Pesquisa P"), animalId: a1.id, link: "linked" },
    })
    // Cadastrando em Q: o indivíduo existe em P e ainda não está em Q — cabe vinculá-lo.
    const other = await create(validAnimal(w.researchQ, a1.controlId))
    expect((await json<ErrorBody>(other)).params).toMatchObject({ animalId: a1.id, link: "none" })

    const simba = await create({
      ...validAnimal(w.researchP, newControlId("D")),
      simbaRecordNumber: simbaOfA1,
    })
    expect(simba.status).toBe(409)
    expect((await json<ErrorBody>(simba)).code).toBe("animalSimbaDuplicateInResearch")
    expect(await prisma.animal.count({ where: { orgId: w.orgA } })).toBe(before)
  })

  it("repetido numa pesquisa FORA do escopo: 409 com a identidade mínima para pedir o indivíduo", async () => {
    login(w.as.resQ)
    const res = await create(validAnimal(w.researchQ, a1.controlId))
    expect(res.status).toBe(409)
    expect(await json<ErrorBody>(res)).toMatchObject({
      code: "animalControlDuplicateOutOfScope",
      params: {
        research: w.name("Pesquisa P"),
        animalId: a1.id,
        species: "Sotalia guianensis",
        location: `${marker}, SC`,
      },
    })
  })

  it("o identificador é único por organização: outra organização pode repetir", async () => {
    login(w.as.adminB)
    const res = await create(validAnimal(w.researchB, a1.controlId))
    expect(res.status).toBe(201)
    expect(await prisma.animal.count({ where: { controlId: a1.controlId } })).toBe(2)
  })

  it.each([
    ["sem ID de controle", { controlId: "  " }],
    ["sexo fora da lista", { sex: "X" }],
    ["estágio de vida fora da lista", { lifeStage: "VELHO" }],
    ["latitude fora da faixa", { strandingLat: 91 }],
    ["longitude fora da faixa", { strandingLon: -181 }],
    ["data fora do formato ISO", { eventDate: "02/05/2026" }],
    ["peso negativo", { necropsyWeightKg: -1 }],
    ["sem pesquisa", { researchId: "" }],
  ])("valida o corpo (422): %s", async (name, over) => {
    login(w.as.adminA)
    const controlId = newControlId(`INV-${name}`)
    const res = await create({ ...validAnimal(w.researchP, controlId), ...over })
    expect(res.status).toBe(422)
    expect((await json<ErrorBody>(res)).code).toBe("validation")
    expect(await prisma.animal.count({ where: { controlId } })).toBe(0)
  })

  it("sem sessão ou sem organização ativa responde 401", async () => {
    const controlId = newControlId("E")
    login(null)
    expect((await create(validAnimal(w.researchP, controlId))).status).toBe(401)
    login(w.as.sysAdmin)
    expect((await create(validAnimal(w.researchP, controlId))).status).toBe(401)
    expect(await prisma.animal.count({ where: { controlId } })).toBe(0)
  })
})

describe("GET /api/animals/[id] — detalhe", () => {
  let animal: { id: string; controlId: string }

  beforeAll(async () => {
    animal = await makeAnimal(w, w.researchP, { municipality: "Detalhe" })
    await makeShare(animal.id, w.researchQ)
    await makeSample(w, animal.id, w.researchP)
    await makeSample(w, animal.id, w.researchP)
    await makeSample(w, animal.id, w.researchQ)
    await makeMedia(animal.id, w.researchP, w.users.resP)
  })

  type Detail = {
    id: string
    controlId: string
    research: { id: string }
    participations: { status: string; research: { id: string } }[]
    _count: { samples: number; media: number }
  }

  it("devolve o indivíduo com a pesquisa primária e as participações", async () => {
    login(w.as.adminA)
    const res = await detail(animal.id)
    expect(res.status).toBe(200)
    expect(await json<Detail>(res)).toMatchObject({
      id: animal.id,
      controlId: animal.controlId,
      municipality: "Detalhe",
      research: { id: w.researchP },
      participations: [{ status: "ACCEPTED", research: { id: w.researchQ } }],
      _count: { samples: 3, media: 1 },
    })
  })

  it("as contagens das abas seguem o escopo: cada pesquisador conta só o da sua pesquisa", async () => {
    login(w.as.resP)
    expect((await json<Detail>(await detail(animal.id)))._count).toEqual({ samples: 2, media: 1 })
    login(w.as.resQ)
    expect((await json<Detail>(await detail(animal.id)))._count).toEqual({ samples: 1, media: 0 })
  })

  it("convite pendente aparece para quem convidou, mas não dá acesso à convidada", async () => {
    const invited = await makeAnimal(w, w.researchP)
    await makeShare(invited.id, w.researchQ, { status: "PENDING", invitedById: w.users.resP })
    login(w.as.resP)
    expect((await json<Detail>(await detail(invited.id))).participations).toMatchObject([
      { status: "PENDING", research: { id: w.researchQ } },
    ])
    login(w.as.resQ)
    expect((await detail(invited.id)).status).toBe(403)
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    expect(await deniedStatuses(w, () => detail(animal.id))).toEqual(DENIED)
    login(w.as.adminA)
    const missing = await detail(randomUUID())
    expect(missing.status).toBe(404)
    expect((await json<ErrorBody>(missing)).code).toBe("animalNotFound")
  })
})

describe("PUT /api/animals/[id] — edição", () => {
  it("altera os campos enviados e audita cada um com valor antigo, novo e autor", async () => {
    const animal = await makeAnimal(w, w.researchP, { municipality: "Penha", state: "SC" })
    login(w.as.resP)
    const res = await update(animal.id, {
      species: "Tursiops truncatus",
      sex: "M",
      municipality: null,
      eventDate: "2026-06-01",
      strandingLat: -27.1,
    })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ id: animal.id, species: "Tursiops truncatus" })

    const row = await prisma.animal.findUniqueOrThrow({ where: { id: animal.id } })
    expect(row).toMatchObject({
      species: "Tursiops truncatus",
      sex: "M",
      municipality: null,
      state: "SC", // não enviado: intacto
      strandingLat: -27.1,
      controlId: animal.controlId,
    })

    const log = await auditOf("Animal", animal.id)
    expect(log.every((l) => l.userId === w.users.resP)).toBe(true)
    expect(Object.fromEntries(log.map((l) => [l.field, [l.oldValue, l.newValue]]))).toEqual({
      species: ["Sotalia guianensis", "Tursiops truncatus"],
      sex: ["F", "M"],
      municipality: ["Penha", null],
      eventDate: [null, new Date("2026-06-01").toISOString()],
      strandingLat: [null, "-27.1"],
    })
  })

  it("só o admin altera a visibilidade — e a mudança é auditada", async () => {
    const animal = await makeAnimal(w, w.researchP, { isPublic: true, municipality: "Antes" })
    login(w.as.resP)
    const denied = await update(animal.id, { isPublic: false, municipality: "Depois" })
    expect(denied.status).toBe(403)
    // A recusa vale para o corpo inteiro: nada é gravado.
    expect(await prisma.animal.findUniqueOrThrow({ where: { id: animal.id } })).toMatchObject({
      isPublic: true,
      municipality: "Antes",
    })
    expect(await auditOf("Animal", animal.id)).toEqual([])

    login(w.as.adminA)
    expect((await update(animal.id, { isPublic: false })).status).toBe(200)
    expect((await prisma.animal.findUniqueOrThrow({ where: { id: animal.id } })).isPublic).toBe(
      false,
    )
    expect(await auditOf("Animal", animal.id)).toEqual([
      { field: "isPublic", oldValue: "true", newValue: "false", userId: w.users.adminA },
    ])
  })

  it("a pesquisa primária não muda pela edição; a participante também edita a identidade", async () => {
    const animal = await makeAnimal(w, w.researchP)
    await makeShare(animal.id, w.researchQ)
    login(w.as.resQ)
    const res = await update(animal.id, { researchId: w.researchQ, lifeStage: "PUP" })
    expect(res.status).toBe(200)
    expect(await prisma.animal.findUniqueOrThrow({ where: { id: animal.id } })).toMatchObject({
      researchId: w.researchP,
      lifeStage: "PUP",
    })
  })

  it("recusa identificador que já existe na organização (409) e mantém o original", async () => {
    const animal = await makeAnimal(w, w.researchP)
    login(w.as.resP)
    const res = await update(animal.id, { controlId: a1.controlId })
    expect(res.status).toBe(409)
    expect(await json<ErrorBody>(res)).toMatchObject({
      code: "animalControlDuplicateInResearch",
      params: { animalId: a1.id },
    })
    expect((await prisma.animal.findUniqueOrThrow({ where: { id: animal.id } })).controlId).toBe(
      animal.controlId,
    )
  })

  it("valida o corpo (422) sem gravar", async () => {
    const animal = await makeAnimal(w, w.researchP)
    login(w.as.resP)
    for (const body of [
      { sex: "X" },
      { controlId: "" },
      { strandingLon: 200 },
      { necropsyDate: "ontem" },
    ]) {
      const res = await update(animal.id, body)
      expect(res.status).toBe(422)
      expect((await json<ErrorBody>(res)).code).toBe("validation")
    }
    expect(await prisma.animal.findUniqueOrThrow({ where: { id: animal.id } })).toMatchObject({
      sex: "F",
      controlId: animal.controlId,
    })
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const animal = await makeAnimal(w, w.researchP, { municipality: "Intacto" })
    expect(await deniedStatuses(w, () => update(animal.id, { municipality: "Invadido" }))).toEqual(
      DENIED,
    )
    expect((await prisma.animal.findUniqueOrThrow({ where: { id: animal.id } })).municipality).toBe(
      "Intacto",
    )
    login(w.as.adminA)
    expect((await update(randomUUID(), { municipality: "x" })).status).toBe(404)
  })
})

describe("DELETE /api/animals/[id] — exclusão", () => {
  it("membro da pesquisa primária exclui: somem o indivíduo, o laudo, a mídia e os arquivos", async () => {
    const animal = await makeAnimal(w, w.researchP)
    const media = await makeMedia(animal.id, w.researchP, w.users.resP)
    const other = await makeMedia(a2.id, w.researchP, w.users.resP)
    await prisma.necropsySystemExam.create({
      data: { animalId: animal.id, systemId: w.systemId, status: "NO_CHANGE", position: 1 },
    })
    login(w.as.resP2)
    expect((await remove(animal.id)).status).toBe(204)
    expect(await exists(animal.id)).toBe(false)
    expect(await prisma.animalMedia.count({ where: { animalId: animal.id } })).toBe(0)
    expect(await prisma.necropsySystemExam.count({ where: { animalId: animal.id } })).toBe(0)
    const files = fakeSupabase.files(MEDIA_BUCKET)
    expect(files).not.toContain(media.path)
    expect(files).toContain(other.path) // arquivo de outro indivíduo fica
  })

  it("indivíduo com amostras não é excluído (409), nem pelo admin", async () => {
    const animal = await makeAnimal(w, w.researchP)
    await makeSample(w, animal.id, w.researchP)
    const media = await makeMedia(animal.id, w.researchP, w.users.resP)
    for (const user of [w.as.resP, w.as.adminA]) {
      login(user)
      const res = await remove(animal.id)
      expect(res.status).toBe(409)
      expect((await json<ErrorBody>(res)).code).toBe("animalHasSamples")
    }
    expect(await exists(animal.id)).toBe(true)
    expect(fakeSupabase.files(MEDIA_BUCKET)).toContain(media.path)
  })

  it("no compartilhado: a participante não exclui (403), a primária também não (409); o admin exclui", async () => {
    const animal = await makeAnimal(w, w.researchP)
    await makeShare(animal.id, w.researchQ)

    login(w.as.resQ)
    const notPrimary = await remove(animal.id)
    expect(notPrimary.status).toBe(403)
    expect((await json<ErrorBody>(notPrimary)).code).toBe("animalDeleteNotPrimary")

    login(w.as.resP)
    const isShared = await remove(animal.id)
    expect(isShared.status).toBe(409)
    expect((await json<ErrorBody>(isShared)).code).toBe("animalDeleteShared")
    expect(await exists(animal.id)).toBe(true)

    login(w.as.adminA)
    expect((await remove(animal.id)).status).toBe(204)
    expect(await exists(animal.id)).toBe(false)
    expect(await prisma.animalResearch.count({ where: { animalId: animal.id } })).toBe(0)
  })

  it("convite ainda pendente não impede a pesquisa primária de excluir", async () => {
    const animal = await makeAnimal(w, w.researchP)
    await makeShare(animal.id, w.researchQ, { status: "PENDING" })
    login(w.as.resP)
    expect((await remove(animal.id)).status).toBe(204)
    expect(await exists(animal.id)).toBe(false)
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const animal = await makeAnimal(w, w.researchP)
    expect(await deniedStatuses(w, () => remove(animal.id))).toEqual(DENIED)
    expect(await exists(animal.id)).toBe(true)
    login(w.as.adminA)
    expect((await remove(randomUUID())).status).toBe(404)
  })

  // BUG: a exclusão do indivíduo — a operação mais destrutiva do domínio — não grava nenhum
  // AuditLog: não fica registro de quem excluiu nem de qual era o identificador.
  it.fails("a exclusão deixa um evento de auditoria com o autor", async () => {
    const animal = await makeAnimal(w, w.researchP)
    login(w.as.resP)
    expect((await remove(animal.id)).status).toBe(204)
    expect((await auditOf("Animal", animal.id)).length).toBeGreaterThan(0)
  })
})

describe("GET /api/animals/[id]/audit — timeline", () => {
  type Entry = {
    entity: string
    field: string
    oldValue: string | null
    newValue: string | null
    author: string
    pathogen: { scientificName: string } | null
    examType: { name: { pt: string } } | null
    organ: { name: { pt: string } } | null
    sample: { identification: string } | null
  }
  let animal: string
  let sampleP: { id: string; identification: string }
  let sampleQ: { id: string; identification: string }

  const log = (entity: string, entityId: string, field: string, newValue: string, userId: string) =>
    prisma.auditLog.create({ data: { entity, entityId, field, oldValue: null, newValue, userId } })
  const timeline = async (id = animal) => json<Entry[]>(await audit(id))

  beforeAll(async () => {
    animal = (await makeAnimal(w, w.researchP)).id
    await makeShare(animal, w.researchQ)
    sampleP = await makeSample(w, animal, w.researchP)
    sampleQ = await makeSample(w, animal, w.researchQ)
    const analysisP = await makeScreening(w, sampleP.id, "POSITIVO")
    const exam = await prisma.necropsySystemExam.create({
      data: { animalId: animal, systemId: w.systemId, status: "ALTERED", position: 1 },
    })
    await log("Animal", animal, "species", "Sotalia guianensis", w.users.resP)
    await log("Biometry", animal, "Comprimento total", "198", w.users.resP)
    await log("Sample", sampleP.id, "created", sampleP.identification, w.users.resP)
    await log("Sample", sampleQ.id, "created", sampleQ.identification, w.users.resQ)
    await log("Analysis", analysisP, "result", "POSITIVO", w.users.resP)
    await log("NecropsySystemExam", exam.id, w.name("sys"), "ALTERED", w.users.adminA)
    // Outro indivíduo: não pode aparecer nesta timeline.
    await log("Animal", a2.id, "species", "de outro indivíduo", w.users.resP)
  })

  it("reúne indivíduo, biometria, amostras, análises e laudo, com autor e contexto", async () => {
    login(w.as.adminA)
    const res = await audit(animal)
    expect(res.status).toBe(200)
    const entries = await json<Entry[]>(res)
    expect(sorted(entries.map((e) => e.entity))).toEqual(
      sorted(["Animal", "Biometry", "Sample", "Sample", "Analysis", "NecropsySystemExam"]),
    )
    // Mais recente primeiro.
    expect(entries[0]!.entity).toBe("NecropsySystemExam")
    expect(entries[0]!.author).toBe(w.name("adminA"))

    expect(entries.find((e) => e.entity === "Analysis")).toMatchObject({
      field: "result",
      newValue: "POSITIVO",
      author: w.name("resP"),
      pathogen: { scientificName: w.name("Pat") },
      examType: { name: { pt: w.name("exam") } },
      organ: { name: { pt: w.name("organ") } },
      sample: { identification: sampleP.identification },
    })
    expect(entries.map((e) => e.newValue)).not.toContain("de outro indivíduo")
  })

  it("no compartilhado, cada pesquisador vê o histórico do indivíduo e só o das SUAS amostras", async () => {
    login(w.as.resQ)
    const entries = await timeline()
    expect(sorted(entries.map((e) => e.entity))).toEqual(
      sorted(["Animal", "Biometry", "Sample", "NecropsySystemExam"]),
    )
    expect(entries.find((e) => e.entity === "Sample")?.sample).toEqual({
      identification: sampleQ.identification,
    })
  })

  it("indivíduo sem alterações devolve lista vazia", async () => {
    const fresh = (await makeAnimal(w, w.researchP)).id
    login(w.as.resP)
    expect(await timeline(fresh)).toEqual([])
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    expect(await deniedStatuses(w, () => audit(animal))).toEqual(DENIED)
    login(w.as.adminA)
    expect((await audit(randomUUID())).status).toBe(404)
  })

  // BUG: esvaziar uma célula da grade grava o AuditLog da saída (POSITIVO → vazio) e apaga a
  // análise. A timeline só busca logs de análises que AINDA existem, então o evento gravado
  // nunca aparece: o resultado some da grade e do histórico ao mesmo tempo.
  it.fails("o resultado removido da grade continua aparecendo na timeline", async () => {
    const target = (await makeAnimal(w, w.researchP)).id
    const sample = await makeSample(w, target, w.researchP)
    const cell = (result: string | null) =>
      putAnalysis(
        req("/api/analyses", {
          method: "PUT",
          body: { sampleId: sample.id, pathogenId: w.pathogenId, examTypeId: w.examId, result },
        }),
      )
    login(w.as.resP)
    expect((await cell("POSITIVO")).status).toBe(200)
    expect((await cell(null)).status).toBe(200)
    const entries = await timeline(target)
    expect(entries.some((e) => e.entity === "Analysis" && e.oldValue === "POSITIVO")).toBe(true)
  })
})

describe("GET /api/animals/[id]/grid — grade de análises", () => {
  type Grid = {
    sections: {
      research: { id: string }
      protocol: { organId: string; pathogenId: string; examTypeId: string; status: string }[]
      samples: { id: string; organ: { id: string } }[]
    }[]
    analyses: {
      id: string
      sampleId: string
      parentAnalysisId: string | null
      result: string | null
      sequences: { marker: string | null }[]
    }[]
  }
  let animal: string
  let sampleP: string
  let sampleQ: string
  let screeningP: string
  let confirmationP: string
  let screeningQ: string

  beforeAll(async () => {
    animal = (await makeAnimal(w, w.researchP)).id
    await makeShare(animal, w.researchQ)
    sampleP = (await makeSample(w, animal, w.researchP)).id
    sampleQ = (await makeSample(w, animal, w.researchQ)).id
    screeningP = await makeScreening(w, sampleP, "POSITIVO")
    screeningQ = await makeScreening(w, sampleQ, "NEGATIVO")
    confirmationP = (
      await prisma.analysis.create({
        data: {
          sampleId: sampleP,
          parentAnalysisId: screeningP,
          pathogenId: w.speciesId,
          examTypeId: w.seqExamId,
          result: "POSITIVO",
          sequences: { create: { marker: "18S rRNA" } },
        },
        select: { id: true },
      })
    ).id
  })

  it("devolve uma seção por pesquisa, com o protocolo dela, e as análises numa lista plana", async () => {
    login(w.as.adminA)
    const res = await grid(animal)
    expect(res.status).toBe(200)
    const body = await json<Grid>(res)
    expect(body.sections.map((s) => s.research.id)).toEqual([w.researchP, w.researchQ])
    expect(body.sections[0]).toMatchObject({
      protocol: [
        { organId: w.organId, pathogenId: w.pathogenId, examTypeId: w.examId, status: "ACTIVE" },
      ],
      samples: [{ id: sampleP, organ: { id: w.organId } }],
    })
    expect(body.sections[1]!.samples.map((s) => s.id)).toEqual([sampleQ])

    expect(sorted(body.analyses.map((a) => a.id))).toEqual(
      sorted([screeningP, confirmationP, screeningQ]),
    )
    expect(body.analyses.find((a) => a.id === confirmationP)).toMatchObject({
      parentAnalysisId: screeningP,
      sequences: [{ marker: "18S rRNA" }],
    })
  })

  it("no compartilhado, cada pesquisador recebe só a seção e as análises da sua pesquisa", async () => {
    login(w.as.resQ)
    const q = await json<Grid>(await grid(animal))
    expect(q.sections.map((s) => s.research.id)).toEqual([w.researchQ])
    expect(q.analyses.map((a) => a.id)).toEqual([screeningQ])

    login(w.as.resP)
    const p = await json<Grid>(await grid(animal))
    expect(p.sections.map((s) => s.research.id)).toEqual([w.researchP])
    expect(sorted(p.analyses.map((a) => a.id))).toEqual(sorted([screeningP, confirmationP]))
  })

  it("indivíduo sem amostras devolve a grade vazia", async () => {
    login(w.as.resP)
    expect(await json(await grid(a2.id))).toEqual({ sections: [], analyses: [] })
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    expect(await deniedStatuses(w, () => grid(animal))).toEqual(DENIED)
    login(w.as.adminA)
    expect((await grid(randomUUID())).status).toBe(404)
  })
})
