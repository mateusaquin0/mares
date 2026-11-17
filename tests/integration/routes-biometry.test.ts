import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { ctx, json, login, member, req } from "./helpers/route"
import {
  DENIED,
  auditOf,
  deniedStatuses,
  destroyWorld,
  makeAnimal,
  makeShare,
  newWorld,
  seedWorld,
} from "./helpers/animals-world"

// Biometria do indivíduo, pelos handlers reais (o SIMBA é substituído por um `fetch` falso):
//   GET/PUT /api/animals/[id]/biometry
//   POST    /api/animals/[id]/biometry/simba   (prévia da importação — não grava)
//
// O que protegem: a biometria é do INDIVÍDUO (as pesquisas que o compartilham veem e editam o
// mesmo bloco); o "Peso total" mora na coluna do animal e não no JSON; cada medida alterada vai
// para a auditoria com o rótulo; e a prévia do SIMBA nunca grava nem aceita pareamento duvidoso.

import { GET as getBiometry, PUT as putBiometry } from "@/app/api/animals/[id]/biometry/route"
import { POST as previewSimba } from "@/app/api/animals/[id]/biometry/simba/route"

vi.setConfig({ testTimeout: 30_000 })

const w = newWorld("RBI")

type Measure = { label: string; value: number | null }
type BiometryBody = {
  biometry: { group: string | null; unit: string | null; measures: Measure[] } | null
  weightKg: number | null
  knownGroups: string[]
  knownLabels: string[]
  canImport: boolean
}
type PreviewBody = {
  biometry: { group: string | null; unit: string | null; measures: Measure[] } | null
  weightKg: number | null
  mismatch: { labels: number; values: number } | null
}
type ErrorBody = { code: string }

const read = (id: string) => getBiometry(req(`/api/animals/${id}/biometry`), ctx({ id }))
const save = (id: string, body: unknown) =>
  putBiometry(req(`/api/animals/${id}/biometry`, { method: "PUT", body }), ctx({ id }))
const preview = (id: string) =>
  previewSimba(req(`/api/animals/${id}/biometry/simba`, { method: "POST" }), ctx({ id }))

const stateOf = (id: string) =>
  prisma.animal.findUniqueOrThrow({
    where: { id },
    select: { measurements: true, necropsyWeightKg: true },
  })
const group = `Odontoceti ${w.tag}`
const ofP = async (over: Parameters<typeof makeAnimal>[2] = {}) =>
  (await makeAnimal(w, w.researchP, over)).id

beforeAll(async () => {
  await seedWorld(w)
})

afterAll(async () => {
  await destroyWorld(w)
})

describe("GET /api/animals/[id]/biometry", () => {
  it("indivíduo sem biometria: bloco nulo e importação indisponível sem número do SIMBA", async () => {
    const animal = await ofP()
    login(w.as.resP)
    const res = await read(animal)
    expect(res.status).toBe(200)
    expect(await json<BiometryBody>(res)).toMatchObject({
      biometry: null,
      weightKg: null,
      knownLabels: [],
      canImport: false,
    })
  })

  it("devolve o bloco, o peso da coluna e o vocabulário do grupo já visto na organização", async () => {
    // Outro indivíduo do mesmo grupo: os rótulos dele também alimentam o autocompletar.
    await ofP({
      measurements: {
        group,
        unit: "Cm",
        measures: [
          { label: "Comprimento total", value: 190 },
          { label: "Peso total", value: null },
        ],
      },
    })
    const animal = await ofP({
      simbaRecordNumber: `SIMBA-${w.tag}-1`,
      necropsyWeightKg: 85.5,
      measurements: { group, unit: "Cm", measures: [{ label: "Largura da caudal", value: 41 }] },
    })
    login(w.as.resP)
    const body = await json<BiometryBody>(await read(animal))
    expect(body.biometry).toEqual({
      group,
      unit: "Cm",
      measures: [{ label: "Largura da caudal", value: 41 }],
    })
    expect(body.weightKg).toBe(85.5)
    expect(body.canImport).toBe(true)
    expect(body.knownGroups).toContain(group)
    expect([...body.knownLabels].sort()).toEqual(
      ["Comprimento total", "Largura da caudal", "Peso total"].sort(),
    )
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const animal = await ofP()
    expect(await deniedStatuses(w, () => read(animal))).toEqual(DENIED)
    login(w.as.adminA)
    expect((await read(randomUUID())).status).toBe(404)
  })
})

describe("PUT /api/animals/[id]/biometry", () => {
  const block = (measures: Measure[]) => ({ group, unit: "Cm", measures })

  it("grava o bloco, leva o Peso total para a coluna do animal e audita cada medida", async () => {
    const animal = await ofP()
    login(w.as.resP)
    const res = await save(
      animal,
      block([
        { label: "Comprimento total", value: 198 },
        { label: "Peso total", value: 85.5 },
        { label: "Número de dentes", value: null },
      ]),
    )
    expect(res.status).toBe(200)
    const body = await json<BiometryBody>(res)
    expect(body.weightKg).toBe(85.5)
    expect(body.biometry?.measures).toEqual([
      { label: "Comprimento total", value: 198 },
      { label: "Peso total", value: null }, // o rótulo fica; o valor mora na coluna
      { label: "Número de dentes", value: null },
    ])
    expect(body.knownGroups).toContain(group)

    const row = await stateOf(animal)
    expect(row.necropsyWeightKg).toBe(85.5)
    expect(row.measurements).toEqual({ group, unit: "Cm", measures: body.biometry?.measures })

    const log = await auditOf("Biometry", animal)
    expect(log.every((l) => l.userId === w.users.resP)).toBe(true)
    expect(Object.fromEntries(log.map((l) => [l.field, [l.oldValue, l.newValue]]))).toEqual({
      "Comprimento total": [null, "198"],
      necropsyWeightKg: [null, "85.5"],
    })
  })

  it("na regravação audita só o que mudou, com valor antigo e novo", async () => {
    const animal = await ofP({
      necropsyWeightKg: 80,
      measurements: {
        group,
        unit: "Cm",
        measures: [
          { label: "Comprimento total", value: 198 },
          { label: "Largura da caudal", value: 41 },
          { label: "Peso total", value: null },
        ],
      },
    })
    login(w.as.resP2)
    const res = await save(
      animal,
      block([
        { label: "Comprimento total", value: 199.5 },
        { label: "Largura da caudal", value: 41 },
        { label: "Peso total", value: 0 }, // zero é preenchimento de formulário: limpa o peso
      ]),
    )
    expect(res.status).toBe(200)
    expect((await stateOf(animal)).necropsyWeightKg).toBeNull()
    const log = await auditOf("Biometry", animal)
    expect(log.map((l) => [l.field, l.oldValue, l.newValue, l.userId]).sort()).toEqual(
      [
        ["Comprimento total", "198", "199.5", w.users.resP2],
        ["necropsyWeightKg", "80", null, w.users.resP2],
      ].sort(),
    )
  })

  it("bloco sem o rótulo de peso não toca no peso digitado no formulário do indivíduo", async () => {
    const animal = await ofP({ necropsyWeightKg: 12.3 })
    login(w.as.resP)
    const res = await save(animal, block([{ label: "Comprimento total", value: 90 }]))
    expect(res.status).toBe(200)
    expect((await json<BiometryBody>(res)).weightKg).toBe(12.3)
    expect((await stateOf(animal)).necropsyWeightKg).toBe(12.3)
    expect((await auditOf("Biometry", animal)).map((l) => l.field)).toEqual(["Comprimento total"])
  })

  it("sem medidas e sem grupo a coluna volta a NULL (biometria não preenchida)", async () => {
    const animal = await ofP({
      measurements: { group, unit: "Cm", measures: [{ label: "Comprimento total", value: 90 }] },
    })
    login(w.as.resP)
    const res = await save(animal, { measures: [] })
    expect(res.status).toBe(200)
    expect((await json<BiometryBody>(res)).biometry).toBeNull()
    expect((await stateOf(animal)).measurements).toBeNull()
    expect(await auditOf("Biometry", animal)).toEqual([
      { field: "Comprimento total", oldValue: "90", newValue: null, userId: w.users.resP },
    ])
  })

  it("a pesquisa que compartilha o indivíduo edita o mesmo bloco; convite pendente, não", async () => {
    const animal = await ofP()
    await makeShare(animal, w.researchQ, { status: "PENDING" })
    login(w.as.resQ)
    expect((await save(animal, block([{ label: "Comprimento total", value: 1 }]))).status).toBe(403)
    expect((await stateOf(animal)).measurements).toBeNull()

    await prisma.animalResearch.update({
      where: { animalId_researchId: { animalId: animal, researchId: w.researchQ } },
      data: { status: "ACCEPTED" },
    })
    expect((await save(animal, block([{ label: "Comprimento total", value: 150 }]))).status).toBe(
      200,
    )
    login(w.as.resP)
    const body = await json<BiometryBody>(await read(animal))
    expect(body.biometry?.measures).toEqual([{ label: "Comprimento total", value: 150 }])
  })

  it.each([
    [
      "rótulo repetido (ignorando caixa e acento)",
      [
        { label: "Comprimento total", value: 1 },
        { label: "comprimento  TOTAL", value: 2 },
      ],
    ],
    ["valor negativo", [{ label: "Comprimento total", value: -1 }]],
    ["valor não numérico", [{ label: "Comprimento total", value: "198" }]],
    ["rótulo vazio", [{ label: "", value: 1 }]],
    ["mais de 100 medidas", Array.from({ length: 101 }, (_, i) => ({ label: `m${i}`, value: i }))],
  ])("valida o corpo (422): %s", async (_name, measures) => {
    const animal = await ofP()
    login(w.as.resP)
    const res = await save(animal, { group, unit: "Cm", measures })
    expect(res.status).toBe(422)
    expect((await json<ErrorBody>(res)).code).toBe("validation")
    expect((await stateOf(animal)).measurements).toBeNull()
    expect(await auditOf("Biometry", animal)).toEqual([])
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const animal = await ofP()
    const attempt = () => save(animal, block([{ label: "Comprimento total", value: 1 }]))
    expect(await deniedStatuses(w, attempt)).toEqual(DENIED)
    expect((await stateOf(animal)).measurements).toBeNull()
    login(w.as.adminA)
    expect((await save(randomUUID(), block([]))).status).toBe(404)
  })
})

describe("POST /api/animals/[id]/biometry/simba — prévia da importação", () => {
  const record = (measurement: string) => `<?xml version="1.0"?>
<dwr:SimpleDarwinRecordSet xmlns:dwc="http://rs.tdwg.org/dwc/terms/">
  <dwr:SimpleDarwinRecord>
    <dwc:recordNumber>SIMBA-FIXTURE</dwc:recordNumber>
    <dwc:scientificName>Sotalia guianensis</dwc:scientificName>
    <dwc:eventDate>2026-03-15</dwc:eventDate>
    ${measurement}
  </dwr:SimpleDarwinRecord>
</dwr:SimpleDarwinRecordSet>`
  const paired = record(`<dc:measurementID>ID: 225696, Aves</dc:measurementID>
    <dc:measurementUnit>Cm</dc:measurementUnit>
    <dc:measurementType>"Comprimento total", "Peso total", "Largura da caudal"</dc:measurementType>
    <dc:measurementValue>"88.6000", "6.6000", ""</dc:measurementValue>`)
  const unpaired = record(`<dc:measurementID>ID: 1, Aves</dc:measurementID>
    <dc:measurementType>"Comprimento total", "Peso total", "Largura da caudal"</dc:measurementType>
    <dc:measurementValue>"88.6000"</dc:measurementValue>`)

  function simbaAnswers(body: string, status = 200) {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(body, { status, headers: { "content-type": "application/xml" } }),
    )
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }
  const withSimba = (n: number) => ofP({ simbaRecordNumber: `SIMBA-${w.tag}-P${n}` })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("devolve o bloco do SIMBA com o peso à parte — e não grava nada", async () => {
    const animal = await withSimba(1)
    const fetchMock = simbaAnswers(paired)
    login(w.as.resP)
    const res = await preview(animal)
    expect(res.status).toBe(200)
    expect(await json<PreviewBody>(res)).toEqual({
      biometry: {
        group: "Aves",
        unit: "Cm",
        measures: [
          { label: "Comprimento total", value: 88.6 },
          { label: "Peso total", value: null },
          { label: "Largura da caudal", value: null },
        ],
      },
      weightKg: 6.6,
      mismatch: null,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(url.searchParams.get("record_number")).toBe(`SIMBA-${w.tag}-P1`)

    expect(await stateOf(animal)).toEqual({ measurements: null, necropsyWeightKg: null })
    expect(await auditOf("Biometry", animal)).toEqual([])
  })

  it("rótulos e valores em quantidades diferentes: recusa o pareamento e diz o motivo", async () => {
    const animal = await withSimba(2)
    simbaAnswers(unpaired)
    login(w.as.resP)
    const res = await preview(animal)
    expect(res.status).toBe(200)
    expect(await json<PreviewBody>(res)).toEqual({
      biometry: null,
      weightKg: null,
      mismatch: { labels: 3, values: 1 },
    })
  })

  it("registro sem biometria devolve prévia vazia, sem motivo de recusa", async () => {
    const animal = await withSimba(3)
    simbaAnswers(record(""))
    login(w.as.resP)
    expect(await json<PreviewBody>(await preview(animal))).toEqual({
      biometry: null,
      weightKg: null,
      mismatch: null,
    })
  })

  it("indivíduo sem número de registro do SIMBA: 422 e o SIMBA nem é consultado", async () => {
    const animal = await ofP()
    const fetchMock = simbaAnswers(paired)
    login(w.as.resP)
    expect((await preview(animal)).status).toBe(422)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("repassa as falhas do SIMBA: registro inexistente (404) e serviço fora do ar (503)", async () => {
    const animal = await withSimba(4)
    login(w.as.resP)

    simbaAnswers("", 404)
    const notFound = await preview(animal)
    expect(notFound.status).toBe(404)
    expect((await json<ErrorBody>(notFound)).code).toBe("simbaNotFound")

    simbaAnswers("erro", 500)
    const broken = await preview(animal)
    expect(broken.status).toBe(503)
    expect((await json<ErrorBody>(broken)).code).toBe("simbaUnavailable")

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("rede indisponível")
      }),
    )
    const offline = await preview(animal)
    expect(offline.status).toBe(503)
    expect((await json<ErrorBody>(offline)).code).toBe("simbaUnavailable")
  })

  it("limita a cadência por usuário: a 31ª consulta no minuto responde 429 sem ir ao SIMBA", async () => {
    const animal = await withSimba(5)
    const fetchMock = simbaAnswers(paired)
    // Usuário só deste teste: o limite é em memória e por id, não contamina os demais casos.
    login(member(randomUUID(), [w.orgA, "ORG_ADMIN"]))
    for (let i = 0; i < 30; i++) expect((await preview(animal)).status).toBe(200)
    const blocked = await preview(animal)
    expect(blocked.status).toBe(429)
    expect((await json<ErrorBody>(blocked)).code).toBe("rateLimited")
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledTimes(30)
  })

  it("barra sem sessão, outra organização e sem vínculo antes de consultar o SIMBA", async () => {
    const animal = await withSimba(6)
    const fetchMock = simbaAnswers(paired)
    expect(await deniedStatuses(w, () => preview(animal))).toEqual(DENIED)
    expect(fetchMock).not.toHaveBeenCalled()
    login(w.as.adminA)
    expect((await preview(randomUUID())).status).toBe(404)
  })
})
