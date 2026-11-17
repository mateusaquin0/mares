// Complementos: a aba de análises da planilha, os filtros restantes da listagem, a limpeza
// periódica do limitador de requisições e bordas do diagnóstico descritivo.

import { describe, it, expect, vi, afterEach } from "vitest"
import ExcelJS from "exceljs"
import type { Prisma } from "@prisma/client"

import { buildAnimalWhere, parseAnimalListParams } from "@/lib/animal-query"
import { buildAnimalsXlsx, type XlsxAnimal } from "@/lib/animals-xlsx"
import { buildDescriptiveDiagnosis } from "@/lib/necropsy-report"
import { isBroadPathogen } from "@/lib/pathogen"

afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

function animal(over: Partial<XlsxAnimal> = {}): XlsxAnimal {
  return {
    controlId: "901/99",
    simbaRecordNumber: null,
    species: "Sotalia guianensis",
    taxonFamily: null,
    taxonOrder: null,
    sex: "F",
    lifeStage: "ADULT",
    bodyCondition: null,
    decompositionStage: null,
    deathCondition: null,
    eventDate: null,
    necropsyDate: null,
    necropsyWeightKg: null,
    biometry: null,
    municipality: null,
    state: null,
    executingInstitution: null,
    strandingBeach: null,
    strandingLat: null,
    strandingLon: null,
    isPublic: true,
    macroscopicNotes: null,
    anthropicInteraction: null,
    giContentCollected: null,
    giSolidWaste: null,
    giDetailedScreening: null,
    anthropicInteractions: [],
    research: { name: "Projeto X" },
    _count: { samples: 0 },
    samples: [],
    necropsySystems: [],
    histopathology: [],
    ...over,
  }
}

async function rows(animals: XlsxAnimal[], locale: string, sheet: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load((await buildAnimalsXlsx(animals, locale)) as unknown as ArrayBuffer)
  const ws = wb.getWorksheet(sheet)!
  const headers: string[] = []
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = String(cell.value ?? "")
  })
  const out: Record<string, unknown>[] = []
  ws.eachRow((row, i) => {
    if (i === 1) return
    const obj: Record<string, unknown> = {}
    headers.forEach((h, col) => {
      if (h) obj[h] = row.getCell(col).value ?? ""
    })
    out.push(obj)
  })
  return out
}

describe("planilha — análises e patógenos positivos", () => {
  const pcr = { name: { pt: "PCR", en: "PCR assay" }, measureLabel: { pt: "Ct", en: "Ct" } }
  const sorologia = { name: { pt: "Sorologia", en: "Serology" }, measureLabel: null }
  const toxo = { scientificName: "Toxoplasma gondii", name: null }
  const morbi = { scientificName: null, name: { pt: "Morbilivírus", en: "Morbillivirus" } }
  const brucella = { scientificName: "Brucella ceti", name: null }

  const withAnalyses = animal({
    _count: { samples: 2 },
    samples: [
      {
        identification: "A-01",
        research: { name: "Projeto Participante" },
        organ: { name: { pt: "Fígado", en: "Liver" } },
        analyses: [
          {
            result: "POSITIVO",
            measureValue: 31.2,
            notes: "repetido",
            pathogen: toxo,
            examType: pcr,
          },
          {
            result: "NEGATIVO",
            measureValue: null,
            notes: null,
            pathogen: brucella,
            examType: sorologia,
          },
        ],
      },
      {
        identification: "A-02",
        research: { name: "Projeto X" },
        organ: { name: { pt: "Baço", en: "Spleen" } },
        analyses: [
          { result: "POSITIVO", measureValue: null, notes: null, pathogen: morbi, examType: pcr },
          {
            result: "POSITIVO",
            measureValue: null,
            notes: null,
            pathogen: toxo,
            examType: sorologia,
          },
          { result: null, measureValue: null, notes: null, pathogen: brucella, examType: pcr },
        ],
      },
    ],
  })

  // Só POSITIVO entra; negativo, inconclusivo e "não testado" ficam fora do resumo.
  it("a coluna de positivos lista cada patógeno uma vez, em ordem alfabética", async () => {
    const [row] = await rows([withAnalyses], "pt", "Animais")
    expect(row?.["Patógenos positivos"]).toBe("Morbilivírus, Toxoplasma gondii")
    const [en] = await rows([withAnalyses], "en", "Animals")
    expect(en?.["Positive pathogens"]).toBe("Morbillivirus, Toxoplasma gondii")
  })

  it("animal sem positivo fica com a coluna vazia", async () => {
    const [row] = await rows([animal()], "pt", "Animais")
    expect(row?.["Patógenos positivos"]).toBe("")
  })

  it("aba de análises: uma linha por análise, com a pesquisa DONA da amostra", async () => {
    const analyses = await rows([withAnalyses], "pt", "Análises")
    expect(analyses).toHaveLength(5)
    expect(analyses[0]).toEqual({
      Animal: "901/99",
      Espécie: "Sotalia guianensis",
      Amostra: "A-01",
      Pesquisa: "Projeto Participante",
      "Material biológico": "Fígado",
      Patógeno: "Toxoplasma gondii",
      Exame: "PCR",
      Resultado: "Positivo",
      Medida: "Ct",
      Valor: 31.2,
      Observações: "repetido",
    })
  })

  it("exame sem medida e análise sem resultado saem em branco, não como 'null'", async () => {
    const analyses = await rows([withAnalyses], "pt", "Análises")
    expect(analyses[1]).toMatchObject({
      Resultado: "Negativo",
      Medida: "",
      Valor: "",
      Observações: "",
    })
    expect(analyses[4]).toMatchObject({ Patógeno: "Brucella ceti", Resultado: "" })
  })

  it("em inglês traduz resultado, exame, material e nome comum do patógeno", async () => {
    const analyses = await rows([withAnalyses], "en", "Analyses")
    expect(analyses[0]).toMatchObject({
      "Biological material": "Liver",
      Exam: "PCR assay",
      Result: "Positive",
    })
    expect(analyses[2]).toMatchObject({
      Pathogen: "Morbillivirus",
      "Biological material": "Spleen",
    })
  })

  it("sem ID de controle, o animal é identificado pelo Nº SIMBA; sem espécie, 'indeterminada'", async () => {
    const semId = { ...withAnalyses, controlId: null, simbaRecordNumber: "225696", species: null }
    const [first] = await rows([semId], "pt", "Análises")
    expect(first?.Animal).toBe("225696")
    expect(String(first?.["Espécie"]).length).toBeGreaterThan(0)
    expect(first?.["Espécie"]).not.toBe("Sotalia guianensis")
  })
})

describe("buildAnimalWhere — visibilidade e período", () => {
  const and = (qs: string) =>
    (buildAnimalWhere("org-a", undefined, parseAnimalListParams(new URLSearchParams(qs)))
      .AND as Prisma.AnimalWhereInput[]) ?? []

  // Pública EFETIVA = animal público E pesquisa pública; privada é a negação: basta um dos dois.
  it("'privados' inclui animal público dentro de pesquisa privada", () => {
    expect(and("visibility=private")).toContainEqual({
      OR: [{ isPublic: false }, { research: { isPublic: false } }],
    })
    expect(and("visibility=public")).toContainEqual({
      isPublic: true,
      research: { isPublic: true },
    })
  })

  it("só 'até': inclui o dia inteiro informado e não cria limite inferior", () => {
    expect(and("to=2026-01-31")).toContainEqual({
      eventDate: { lte: new Date("2026-01-31T23:59:59.999Z") },
    })
  })

  it("só 'de': a partir da meia-noite UTC do dia", () => {
    expect(and("from=2026-01-01")).toContainEqual({ eventDate: { gte: new Date("2026-01-01") } })
  })

  it("data em formato inválido é ignorada em vez de quebrar a consulta", () => {
    const clauses = and("from=01/01/2026&to=ontem")
    expect(clauses.some((c) => "eventDate" in c)).toBe(false)
  })
})

describe("rateLimit — limpeza periódica das chaves ociosas", () => {
  it("a janela expirada é esquecida e a chave volta a ter o limite inteiro", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"))
    const { rateLimit } = await import("@/lib/rate-limit")
    const opts = { limit: 2, windowMs: 30_000 }

    expect(rateLimit("ip-ocioso", opts).ok).toBe(true)
    expect(rateLimit("ip-ocioso", opts).ok).toBe(true)
    expect(rateLimit("ip-ocioso", opts)).toMatchObject({ ok: false, retryAfter: 30 })

    // Duas varreduras (a cada 60 s): os registros passam da maior janela vista e são descartados.
    vi.advanceTimersByTime(121_000)
    expect(rateLimit("ip-ocioso", opts)).toEqual({ ok: true, remaining: 1, retryAfter: 0 })
  })

  it("a varredura preserva quem ainda está dentro da janela", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"))
    const { rateLimit } = await import("@/lib/rate-limit")
    const opts = { limit: 1, windowMs: 10 * 60_000 }

    expect(rateLimit("ip-ativo", opts).ok).toBe(true)
    vi.advanceTimersByTime(61_000)
    // Uma varredura depois, ainda bloqueado: faltam ~9 minutos.
    const blocked = rateLimit("ip-ativo", opts)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfter).toBe(539)
  })

  it("o tempo de espera nunca é menor que 1 segundo", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"))
    const { rateLimit } = await import("@/lib/rate-limit")
    const opts = { limit: 1, windowMs: 1000 }
    rateLimit("ip-rapido", opts)
    vi.advanceTimersByTime(999)
    expect(rateLimit("ip-rapido", opts)).toMatchObject({ ok: false, retryAfter: 1 })
    vi.advanceTimersByTime(2)
    expect(rateLimit("ip-rapido", opts).ok).toBe(true)
  })
})

describe("diagnóstico descritivo — bordas", () => {
  const organ = (pt: string) => ({ organ: { name: { pt, en: pt } } })

  it("achado sem órgão resolvido sai só com o texto; vazios são descartados", () => {
    expect(
      buildDescriptiveDiagnosis("pt", [
        { organ: { name: null }, finding: "autólise difusa.  " },
        { ...organ("Baço"), finding: "   " },
        { organ: { name: null }, finding: " . " },
        { ...organ("Pulmão"), finding: "edema..." },
      ]),
    ).toBe("autólise difusa. Pulmão, edema.")
  })

  it("lista vazia gera texto vazio", () => {
    expect(buildDescriptiveDiagnosis("pt", [])).toBe("")
  })
})

describe("isBroadPathogen — identificação acima de espécie", () => {
  // Sem rank gravado, o nome igual ao da família indica registro em nível de família.
  it("registro cujo nome é a própria família conta como supraespecífico", () => {
    expect(isBroadPathogen({ scientificName: "Anisakis", taxonFamily: " anisakis " })).toBe(true)
    expect(isBroadPathogen({ scientificName: "Brucella ceti", taxonFamily: "Brucellaceae" })).toBe(
      false,
    )
    expect(isBroadPathogen({ scientificName: "Brucella ceti" })).toBe(false)
  })
})
