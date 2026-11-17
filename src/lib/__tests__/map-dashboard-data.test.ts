// Mapa e dashboard: o que sai do banco vira ponto/indicador aqui. O banco é simulado; o alvo
// é (1) o recorte de visibilidade montado na consulta — o que é público, o que cada pesquisa
// enxerga — e (2) as agregações feitas em memória.

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", async () => (await import("./helpers/prisma-mock")).prismaModule)

import { arg, m, resetDb } from "./helpers/prisma-mock"
import {
  animalOrderBy,
  animalResultsSearchWhere,
  animalScopeWhere,
  parseAnimalListParams,
} from "@/lib/animal-query"
import { getDashboardData } from "@/lib/dashboard"
import { isIsoDay, formatDateOnly } from "@/lib/date"
import { orgMapPoints, publicMapPoints } from "@/lib/map-points"

type Query = { where: Record<string, unknown>; select: Record<string, unknown>; orderBy?: unknown }

const positive = (scientificName: string | null, name: unknown = null) => ({
  pathogen: { scientificName, name },
})
const rawPoint = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  controlId: "902/99",
  species: "Sotalia guianensis",
  strandingLat: -26.9,
  strandingLon: -48.6,
  sex: "F",
  lifeStage: "ADULT",
  municipality: "Itajaí",
  state: "SC",
  strandingBeach: "Praia Brava",
  eventDate: new Date("2026-03-15T00:00:00.000Z"),
  isPublic: true,
  research: { name: "Cetáceos SC", isPublic: true },
  samples: [],
  ...over,
})

beforeEach(() => resetDb())

describe("publicMapPoints — mapa sem login", () => {
  // Público = animal público E pesquisa pública; num indivíduo compartilhado, o positivo da
  // pesquisa participante PRIVADA não pode vazar pelo ponto público.
  it("só animal público de pesquisa pública, com coordenadas, e só amostras de pesquisa pública", async () => {
    m("animal", "findMany").mockResolvedValue([])
    await publicMapPoints("pt")
    const q = arg<Query>(m("animal", "findMany"))
    expect(q.where).toEqual({
      strandingLat: { not: null },
      strandingLon: { not: null },
      isPublic: true,
      research: { isPublic: true },
    })
    expect((q.select.samples as { where: unknown }).where).toEqual({ research: { isPublic: true } })
    expect(q.orderBy).toEqual({ eventDate: "desc" })
  })

  it("serializa o ponto: data como dia ISO, praia e pesquisa renomeadas", async () => {
    m("animal", "findMany").mockResolvedValue([rawPoint()])
    const [point] = await publicMapPoints("pt")
    expect(point).toEqual({
      id: "a1",
      controlId: "902/99",
      species: "Sotalia guianensis",
      lat: -26.9,
      lon: -48.6,
      sex: "F",
      lifeStage: "ADULT",
      municipality: "Itajaí",
      state: "SC",
      beach: "Praia Brava",
      eventDate: "2026-03-15",
      isPublic: true,
      researchName: "Cetáceos SC",
      positivePathogens: [],
    })
  })

  it("o ponto só sai como publicado com o animal marcado e a pesquisa pública", async () => {
    m("animal", "findMany").mockResolvedValue([
      rawPoint({ research: { name: "Privada", isPublic: false } }),
    ])
    const [point] = await publicMapPoints("pt")
    expect(point?.isPublic).toBe(false)
  })

  it("sem data nem pesquisa carregada os campos ficam null", async () => {
    m("animal", "findMany").mockResolvedValue([rawPoint({ eventDate: null, research: null })])
    const [point] = await publicMapPoints("pt")
    expect(point?.eventDate).toBeNull()
    expect(point?.researchName).toBeNull()
  })

  it("patógenos positivos: sem repetição, em ordem alfabética, no idioma pedido", async () => {
    const samples = [
      {
        analyses: [
          positive("Toxoplasma gondii"),
          positive(null, { pt: "Morbilivírus", en: "Morbillivirus" }),
        ],
      },
      {
        analyses: [positive("Toxoplasma gondii"), positive("Brucella ceti"), positive(null, null)],
      },
    ]
    m("animal", "findMany").mockResolvedValue([rawPoint({ samples })])
    expect((await publicMapPoints("pt"))[0]?.positivePathogens).toEqual([
      "Brucella ceti",
      "Morbilivírus",
      "Toxoplasma gondii",
    ])
    expect((await publicMapPoints("en"))[0]?.positivePathogens).toEqual([
      "Brucella ceti",
      "Morbillivirus",
      "Toxoplasma gondii",
    ])
  })
})

describe("orgMapPoints — mapa da organização", () => {
  it("admin: todos os animais da organização com coordenadas, sem filtro nas amostras", async () => {
    m("animal", "findMany").mockResolvedValue([rawPoint({ isPublic: false })])
    const points = await orgMapPoints("org-a", "pt")
    const q = arg<Query>(m("animal", "findMany"))
    expect(q.where).toEqual({
      strandingLat: { not: null },
      strandingLon: { not: null },
      research: { orgId: "org-a" },
    })
    expect((q.select.samples as { where?: unknown }).where).toBeUndefined()
    expect(points[0]?.isPublic).toBe(false)
  })

  // Pesquisador: indivíduos listados nas pesquisas dele (primária ∪ participação aceita,
  // menos os ocultos) e positivos só das amostras que essas pesquisas coletaram.
  it("pesquisador: recorte pelas pesquisas visíveis, nos animais e nas amostras", async () => {
    m("animal", "findMany").mockResolvedValue([])
    await orgMapPoints("org-a", "pt", ["r1", "r2"])
    const q = arg<Query>(m("animal", "findMany"))
    expect(q.where.research).toEqual({ orgId: "org-a" })
    expect(q.where.OR).toEqual([
      { researchId: { in: ["r1", "r2"] }, primaryHiddenAt: null },
      {
        participations: {
          some: { researchId: { in: ["r1", "r2"] }, status: "ACCEPTED", hiddenAt: null },
        },
      },
    ])
    expect((q.select.samples as { where: unknown }).where).toEqual({
      researchId: { in: ["r1", "r2"] },
    })
  })
})

describe("getDashboardData", () => {
  type Programmed = {
    animalCounts?: number[]
    sampleCounts?: number[]
    analysisCounts?: number[]
    species?: { species: string | null; _count: { _all: number } }[]
    examTotals?: { examTypeId: string; _count: { _all: number } }[]
    examPositives?: { examTypeId: string; _count: { _all: number } }[]
    eventDates?: { eventDate: Date | null }[]
    coords?: { strandingLat: number; strandingLon: number }[]
    examTypes?: { id: string; name: unknown }[]
  }
  // Ordem das consultas dentro do Promise.all: animais = [total, testados, positivos];
  // amostras = [total, testadas, positivas]; análises = [com resultado, positivas].
  function program(p: Programmed = {}) {
    const seq = (fn: ReturnType<typeof m>, values: unknown[]) =>
      values.forEach((v) => fn.mockResolvedValueOnce(v))
    seq(m("animal", "count"), p.animalCounts ?? [0, 0, 0])
    seq(m("sample", "count"), p.sampleCounts ?? [0, 0, 0])
    seq(m("analysis", "count"), p.analysisCounts ?? [0, 0])
    m("animal", "groupBy").mockResolvedValue(p.species ?? [])
    seq(m("analysis", "groupBy"), [p.examTotals ?? [], p.examPositives ?? []])
    seq(m("animal", "findMany"), [p.eventDates ?? [], p.coords ?? []])
    m("examType", "findMany").mockResolvedValue(p.examTypes ?? [])
  }

  it("organização sem dados: tudo zerado, sem divisão por zero e sem consultar exames", async () => {
    program()
    const data = await getDashboardData("org-a", "pt")
    expect(data.totals).toEqual({
      animals: 0,
      samples: 0,
      testedAnimals: 0,
      testedSamples: 0,
      analyses: 0,
      positive: 0,
      positiveAnimals: 0,
      positiveSamples: 0,
      positivity: 0,
      positivityByAnimal: 0,
      positivityBySample: 0,
    })
    expect(data).toMatchObject({ species: [], positivityByExam: [], timeline: [], heat: [] })
    expect(m("examType", "findMany")).not.toHaveBeenCalled()
  })

  // Três denominadores diferentes: análises com resultado, animais testados, amostras testadas.
  it("positividade por análise, por animal e por amostra usam cada uma o seu denominador", async () => {
    program({ animalCounts: [10, 8, 2], sampleCounts: [40, 20, 5], analysisCounts: [50, 10] })
    const { totals } = await getDashboardData("org-a", "pt")
    expect(totals).toMatchObject({
      animals: 10,
      testedAnimals: 8,
      positiveAnimals: 2,
      samples: 40,
      testedSamples: 20,
      positiveSamples: 5,
      analyses: 50,
      positive: 10,
    })
    expect(totals.positivity).toBe(20)
    expect(totals.positivityByAnimal).toBe(25)
    expect(totals.positivityBySample).toBe(25)
  })

  it("espécie não determinada recebe rótulo no idioma da tela", async () => {
    const species = [
      { species: "Sotalia guianensis", _count: { _all: 7 } },
      { species: null, _count: { _all: 3 } },
    ]
    program({ species })
    expect((await getDashboardData("org-a", "pt")).species).toEqual([
      { name: "Sotalia guianensis", count: 7 },
      { name: "Indeterminado", count: 3 },
    ])
    resetDb()
    program({ species })
    expect((await getDashboardData("org-a", "en")).species[1]?.name).toBe("Undetermined")
  })

  it("positividade por exame: os 6 de maior volume, com o nome traduzido e 0 positivos quando não há", async () => {
    const totals = [3, 50, 20, 9, 8, 7, 6].map((n, i) => ({
      examTypeId: `e${i}`,
      _count: { _all: n },
    }))
    program({
      examTotals: totals,
      examPositives: [{ examTypeId: "e1", _count: { _all: 5 } }],
      examTypes: [
        { id: "e1", name: { pt: "PCR", en: "PCR assay" } },
        { id: "e2", name: { pt: "Sorologia", en: "Serology" } },
      ],
    })
    const { positivityByExam } = await getDashboardData("org-a", "en")
    expect(positivityByExam.map((e) => e.total)).toEqual([50, 20, 9, 8, 7, 6])
    expect(positivityByExam[0]).toEqual({ label: "PCR assay", total: 50, positives: 5, pct: 10 })
    expect(positivityByExam[1]).toEqual({ label: "Serology", total: 20, positives: 0, pct: 0 })
    // Exame removido do catálogo no intervalo: rótulo vazio, sem quebrar o gráfico.
    expect(positivityByExam[2]?.label).toBe("")
    expect(arg<{ where: { id: { in: string[] } } }>(m("examType", "findMany")).where.id.in).toEqual(
      ["e1", "e2", "e3", "e4", "e5", "e6"],
    )
  })

  it("linha do tempo: encalhes por mês em ordem cronológica (mês em UTC)", async () => {
    program({
      eventDates: [
        { eventDate: new Date("2026-03-01T00:00:00.000Z") },
        { eventDate: new Date("2025-12-31T00:00:00.000Z") },
        { eventDate: new Date("2026-03-31T00:00:00.000Z") },
        { eventDate: null },
        { eventDate: new Date("2026-01-15T00:00:00.000Z") },
      ],
    })
    expect((await getDashboardData("org-a", "pt")).timeline).toEqual([
      { month: "2025-12", count: 1 },
      { month: "2026-01", count: 1 },
      { month: "2026-03", count: 2 },
    ])
  })

  it("mapa de calor recebe os pares [lat, lon]", async () => {
    program({ coords: [{ strandingLat: -26.9, strandingLon: -48.6 }] })
    expect((await getDashboardData("org-a", "pt")).heat).toEqual([[-26.9, -48.6]])
  })

  // A confirmação de espécie (análise-filha) detalha um positivo já contado: somá-la
  // inflaria numerador e denominador.
  it("só o rastreio entra nas métricas — confirmações ficam de fora", async () => {
    program()
    await getDashboardData("org-a", "pt")
    for (const call of m("analysis", "count").mock.calls) {
      expect((call[0] as Query).where.parentAnalysisId).toBeNull()
    }
    for (const call of m("analysis", "groupBy").mock.calls) {
      expect((call[0] as Query).where.parentAnalysisId).toBeNull()
    }
  })

  it("filtro por pesquisa e patógeno restringe animais, amostras e análises", async () => {
    program()
    await getDashboardData("org-a", "pt", { researchId: "r1", pathogenId: "p1" })

    // Análises: do patógeno, em amostras cuja pesquisa DONA é r1.
    const analyses = arg<Query>(m("analysis", "count")).where
    expect(analyses.pathogenId).toBe("p1")
    expect((analyses.sample as { researchId: unknown }).researchId).toEqual({ in: ["r1"] })

    // Amostras testadas: mesma pesquisa dona, com alguma análise do patógeno.
    const tested = arg<Query>(m("sample", "count"), 1).where
    expect(tested.researchId).toEqual({ in: ["r1"] })
    expect(tested.analyses).toEqual({
      some: { result: { not: null }, parentAnalysisId: null, pathogenId: "p1" },
    })

    // Animais positivos: o filtro global é mantido (AND) e a análise positiva tem de estar
    // numa amostra do escopo — a amostra do vizinho não decide.
    const positiveAnimals = arg<Query>(m("animal", "count"), 2).where as {
      AND: [Record<string, unknown>, { samples: { some: Record<string, unknown> } }]
    }
    expect(positiveAnimals.AND[0].research).toEqual({ orgId: "org-a" })
    expect(positiveAnimals.AND[1].samples.some).toEqual({
      researchId: { in: ["r1"] },
      analyses: { some: { result: "POSITIVO", parentAnalysisId: null, pathogenId: "p1" } },
    })
  })

  it("o período filtra a linha do tempo sem perder a exigência de data preenchida", async () => {
    program()
    await getDashboardData("org-a", "pt", { from: "2026-01-01", to: "2026-01-31" })
    const where = arg<Query>(m("animal", "findMany")).where
    expect(where.eventDate).toEqual({
      gte: new Date("2026-01-01"),
      lte: new Date("2026-01-31T23:59:59.999Z"),
      not: null,
    })
  })
})

describe("listagem de animais — parâmetros e ordenação", () => {
  const parse = (qs: string) => parseAnimalListParams(new URLSearchParams(qs))

  it.each([
    ["control", { controlId: "asc" }],
    ["species", { species: "asc" }],
    ["sex", { sex: "asc" }],
    ["location", { municipality: "asc" }],
    ["isPublic", { isPublic: "asc" }],
    ["research", { research: { name: "asc" } }],
    ["samples", { samples: { _count: "asc" } }],
    ["date", { eventDate: { sort: "asc", nulls: "last" } }],
  ] as const)("ordenar por %s", (key, expected) => {
    expect(animalOrderBy(key, "asc")).toEqual(expected)
  })

  it("sem data de encalhe o registro vai para o fim nos dois sentidos", () => {
    expect(animalOrderBy("date", "desc")).toEqual({ eventDate: { sort: "desc", nulls: "last" } })
  })

  it("página inválida, zero ou negativa volta para a primeira", () => {
    expect(parse("page=abc").page).toBe(1)
    expect(parse("page=0").page).toBe(1)
    expect(parse("page=-3").page).toBe(1)
    expect(parse("page=4").page).toBe(4)
  })

  // BUG (src/lib/animal-query.ts:60): `Number(...)` aceita fração e infinito. A rota calcula
  // `skip = (page - 1) * pageSize`; `?page=1.25&pageSize=10` dá skip 2.5 e `?page=Infinity`
  // dá skip Infinity — o Prisma recusa e a listagem responde 500 em vez de normalizar.
  it.fails.each(["1.25", "2.5", "Infinity", "1e400"])(
    "página %s é normalizada para um inteiro finito",
    (raw) => {
      const { page } = parse(`page=${raw}`)
      expect(Number.isSafeInteger(page)).toBe(true)
    },
  )

  it("escopo: admin não tem OR de pesquisa; pesquisador tem o conjunto efetivo", () => {
    expect(animalScopeWhere("org-a")).toEqual({ research: { orgId: "org-a" } })
    expect(animalScopeWhere("org-a", ["r1"])).toEqual({
      research: { orgId: "org-a" },
      OR: [
        { researchId: { in: ["r1"] } },
        { participations: { some: { researchId: { in: ["r1"] }, status: "ACCEPTED" } } },
      ],
    })
  })

  it("busca da grade de resultados: termo vazio não filtra; termo é aparado", () => {
    expect(animalResultsSearchWhere("   ")).toBeNull()
    const where = animalResultsSearchWhere("  sotalia ")
    const contains = { contains: "sotalia", mode: "insensitive" }
    expect(where).toEqual({
      OR: [
        { controlId: contains },
        { simbaRecordNumber: contains },
        { species: contains },
        { municipality: contains },
        { state: contains },
        { strandingBeach: contains },
      ],
    })
  })
})

describe("datas 'somente dia'", () => {
  it.each([
    ["2026-03-10", true],
    ["2026-03-10T00:00:00Z", false],
    ["10/03/2026", false],
    ["2026-13-01", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("isIsoDay(%j) = %s", (value, expected) => {
    expect(isIsoDay(value)).toBe(expected)
  })

  // BUG (src/lib/date.ts:11): mesma causa de optionalDate — Date.parse rola o dia inexistente.
  // Um filtro `to=2026-02-30` vira "até 2 de março" em vez de ser descartado.
  it.fails("isIsoDay recusa dia que não existe no mês", () => {
    expect(isIsoDay("2026-02-30")).toBe(false)
  })

  // Meia-noite UTC no Brasil (UTC-3) é 21h do dia anterior: formatar no fuso local mostraria
  // um dia a menos que o informado (e que o SIMBA).
  it("formata o dia em UTC, sem deslocar pelo fuso local", () => {
    expect(formatDateOnly("2026-03-10T00:00:00.000Z", "pt-BR")).toBe("10/03/2026")
    expect(formatDateOnly(new Date("2026-03-10T00:00:00.000Z"), "en-US")).toBe("3/10/2026")
    expect(formatDateOnly("2026-12-31T00:00:00.000Z", "pt-BR", { month: "long" })).toBe("dezembro")
  })

  it("vazio ou data inválida viram texto vazio", () => {
    expect(formatDateOnly(null, "pt-BR")).toBe("")
    expect(formatDateOnly("", "pt-BR")).toBe("")
    expect(formatDateOnly("não é data", "pt-BR")).toBe("")
  })
})
