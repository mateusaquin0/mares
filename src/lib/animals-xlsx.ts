// MARES — Exportação de animais em Excel (.xlsx) (Fase 6). Gera uma planilha tabular com
// os animais selecionados. Cabeçalhos e rótulos (sexo, estágio de vida, visibilidade) são
// localizados (pt/en). Roda no runtime Node da rota de exportação.

import ExcelJS from "exceljs"

import { txt, pathogenName, type I18nText } from "@/lib/catalog-i18n"
import type { SexValue, LifeStageValue } from "@/lib/animal-enums"

type Result = "POSITIVO" | "NEGATIVO" | "INCONCLUSIVO"

export type XlsxAnalysis = {
  result: Result | null
  measureValue: number | null
  notes: string | null
  // `name`/`measureLabel` como unknown para aceitar o Prisma.JsonValue; convertidos via txt.
  pathogen: { scientificName: string | null; name: unknown }
  examType: { name: unknown; measureLabel: unknown }
}

export type XlsxSample = {
  identification: string
  // Pesquisa dona da amostra (pode diferir da pesquisa primária do indivíduo — compartilhamento).
  research: { name: string }
  organ: { name: unknown }
  analyses: XlsxAnalysis[]
}

const asI18n = (v: unknown) => v as I18nText | string | null

export type XlsxAnimal = {
  controlId: string | null
  simbaRecordNumber: string | null
  species: string
  taxonFamily: string | null
  taxonOrder: string | null
  sex: string | null
  lifeStage: string | null
  bodyCondition: string | null
  decompositionStage: string | null
  deathCondition: string | null
  eventDate: Date | null
  necropsyDate: Date | null
  municipality: string | null
  state: string | null
  strandingBeach: string | null
  strandingLat: number | null
  strandingLon: number | null
  isPublic: boolean
  macroscopicNotes: string | null
  research: { name: string }
  _count: { samples: number }
  samples: XlsxSample[]
}

type Loc = "pt" | "en"

const RESULT: Record<Result, { pt: string; en: string }> = {
  POSITIVO: { pt: "Positivo", en: "Positive" },
  NEGATIVO: { pt: "Negativo", en: "Negative" },
  INCONCLUSIVO: { pt: "Inconclusivo", en: "Inconclusive" },
}

// Nomes distintos de patógenos com ao menos um resultado POSITIVO no animal.
function positivePathogens(a: XlsxAnimal, loc: Loc): string {
  const names = new Set<string>()
  for (const s of a.samples) {
    for (const an of s.analyses) {
      if (an.result === "POSITIVO") {
        const label = pathogenName(loc, {
          scientificName: an.pathogen.scientificName,
          name: asI18n(an.pathogen.name),
        })
        if (label) names.add(label)
      }
    }
  }
  return [...names].sort((x, y) => x.localeCompare(y, loc)).join(", ")
}

// Valores canônicos em animal-enums.ts; aqui os rótulos completos (pt/en) para a planilha.
const SEX: Record<SexValue, { pt: string; en: string }> = {
  M: { pt: "Macho", en: "Male" },
  F: { pt: "Fêmea", en: "Female" },
  U: { pt: "Indeterminado", en: "Undetermined" },
}
const LIFE_STAGE: Record<LifeStageValue, { pt: string; en: string }> = {
  FETUS: { pt: "Feto", en: "Fetus" },
  PUP: { pt: "Filhote", en: "Pup" },
  JUVENILE: { pt: "Juvenil", en: "Juvenile" },
  ADULT: { pt: "Adulto", en: "Adult" },
  UNDETERMINED: { pt: "Indeterminado", en: "Undetermined" },
}

// Colunas da planilha: chave interna + cabeçalho por idioma + largura.
const COLUMNS: { key: string; pt: string; en: string; width: number }[] = [
  { key: "controlId", pt: "ID de controle", en: "Control ID", width: 16 },
  { key: "simba", pt: "Identificador SIMBA", en: "SIMBA identifier", width: 20 },
  { key: "species", pt: "Espécie", en: "Species", width: 24 },
  { key: "family", pt: "Família", en: "Family", width: 18 },
  { key: "order", pt: "Ordem", en: "Order", width: 18 },
  { key: "sex", pt: "Sexo", en: "Sex", width: 14 },
  { key: "lifeStage", pt: "Estágio de vida", en: "Life stage", width: 16 },
  { key: "bodyCondition", pt: "Condição da carcaça", en: "Body condition", width: 18 },
  { key: "decomposition", pt: "Escore corporal", en: "Decomposition score", width: 18 },
  { key: "deathCondition", pt: "Condição da morte", en: "Death condition", width: 18 },
  { key: "eventDate", pt: "Data do encalhe", en: "Stranding date", width: 16 },
  { key: "necropsyDate", pt: "Data de necrópsia", en: "Necropsy date", width: 16 },
  { key: "municipality", pt: "Município", en: "Municipality", width: 18 },
  { key: "state", pt: "Estado", en: "State", width: 10 },
  { key: "beach", pt: "Praia", en: "Beach", width: 20 },
  { key: "lat", pt: "Latitude", en: "Latitude", width: 12 },
  { key: "lon", pt: "Longitude", en: "Longitude", width: 12 },
  { key: "research", pt: "Pesquisa", en: "Research", width: 24 },
  { key: "visibility", pt: "Visibilidade", en: "Visibility", width: 12 },
  { key: "samples", pt: "Amostras", en: "Samples", width: 10 },
  { key: "positives", pt: "Patógenos positivos", en: "Positive pathogens", width: 32 },
  { key: "notes", pt: "Exame externo", en: "External exam", width: 40 },
]

// Colunas da aba de análises (uma linha por análise).
const ANALYSIS_COLUMNS: { key: string; pt: string; en: string; width: number }[] = [
  { key: "animal", pt: "Animal", en: "Animal", width: 16 },
  { key: "species", pt: "Espécie", en: "Species", width: 24 },
  { key: "sample", pt: "Amostra", en: "Sample", width: 16 },
  { key: "research", pt: "Pesquisa", en: "Research", width: 24 },
  { key: "organ", pt: "Órgão", en: "Organ", width: 18 },
  { key: "pathogen", pt: "Patógeno", en: "Pathogen", width: 24 },
  { key: "exam", pt: "Exame", en: "Exam", width: 18 },
  { key: "result", pt: "Resultado", en: "Result", width: 14 },
  { key: "measureLabel", pt: "Medida", en: "Measure", width: 12 },
  { key: "measureValue", pt: "Valor", en: "Value", width: 10 },
  { key: "notes", pt: "Observações", en: "Notes", width: 40 },
]

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "")

function rowFor(a: XlsxAnimal, loc: Loc): Record<string, string | number> {
  const sex = a.sex ? (SEX[a.sex as SexValue]?.[loc] ?? a.sex) : ""
  const lifeStage = a.lifeStage
    ? (LIFE_STAGE[a.lifeStage as LifeStageValue]?.[loc] ?? a.lifeStage)
    : ""
  const visible =
    loc === "en" ? (a.isPublic ? "Public" : "Hidden") : a.isPublic ? "Público" : "Oculto"
  return {
    controlId: a.controlId ?? "",
    simba: a.simbaRecordNumber ?? "",
    species: a.species,
    family: a.taxonFamily ?? "",
    order: a.taxonOrder ?? "",
    sex,
    lifeStage,
    bodyCondition: a.bodyCondition ?? "",
    decomposition: a.decompositionStage ?? "",
    deathCondition: a.deathCondition ?? "",
    eventDate: isoDate(a.eventDate),
    necropsyDate: isoDate(a.necropsyDate),
    municipality: a.municipality ?? "",
    state: a.state ?? "",
    beach: a.strandingBeach ?? "",
    lat: a.strandingLat ?? "",
    lon: a.strandingLon ?? "",
    research: a.research.name,
    visibility: visible,
    samples: a._count.samples,
    positives: positivePathogens(a, loc),
    notes: a.macroscopicNotes ?? "",
  }
}

export async function buildAnimalsXlsx(animals: XlsxAnimal[], locale: string): Promise<Buffer> {
  const loc: Loc = locale === "en" ? "en" : "pt"
  const wb = new ExcelJS.Workbook()
  wb.creator = "MARES"
  const ws = wb.addWorksheet(loc === "en" ? "Animals" : "Animais")
  ws.columns = COLUMNS.map((c) => ({ header: c[loc], key: c.key, width: c.width }))
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: "frozen", ySplit: 1 }]
  for (const a of animals) ws.addRow(rowFor(a, loc))

  // Aba de análises: uma linha por análise (patógeno × exame) de cada amostra.
  const wsA = wb.addWorksheet(loc === "en" ? "Analyses" : "Análises")
  wsA.columns = ANALYSIS_COLUMNS.map((c) => ({ header: c[loc], key: c.key, width: c.width }))
  wsA.getRow(1).font = { bold: true }
  wsA.views = [{ state: "frozen", ySplit: 1 }]
  for (const a of animals) {
    const animalLabel = a.controlId ?? a.simbaRecordNumber ?? ""
    for (const s of a.samples) {
      for (const an of s.analyses) {
        wsA.addRow({
          animal: animalLabel,
          species: a.species,
          sample: s.identification,
          research: s.research.name,
          organ: txt(loc, asI18n(s.organ.name)),
          pathogen: pathogenName(loc, {
            scientificName: an.pathogen.scientificName,
            name: asI18n(an.pathogen.name),
          }),
          exam: txt(loc, asI18n(an.examType.name)),
          result: an.result ? RESULT[an.result][loc] : "",
          measureLabel: an.examType.measureLabel ? txt(loc, asI18n(an.examType.measureLabel)) : "",
          measureValue: an.measureValue ?? "",
          notes: an.notes ?? "",
        })
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
