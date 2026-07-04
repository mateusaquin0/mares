// MARES — Exportação de animais em Excel (.xlsx) (Fase 6). Gera uma planilha tabular com
// os animais selecionados. Cabeçalhos e rótulos (sexo, estágio de vida, visibilidade) são
// localizados (pt/en). Roda no runtime Node da rota de exportação.

import ExcelJS from "exceljs"

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
}

type Loc = "pt" | "en"

const SEX: Record<string, { pt: string; en: string }> = {
  M: { pt: "Macho", en: "Male" },
  F: { pt: "Fêmea", en: "Female" },
  U: { pt: "Indeterminado", en: "Undetermined" },
}
const LIFE_STAGE: Record<string, { pt: string; en: string }> = {
  FETUS: { pt: "Feto", en: "Fetus" },
  PUP: { pt: "Filhote", en: "Pup" },
  JUVENILE: { pt: "Juvenil", en: "Juvenile" },
  ADULT: { pt: "Adulto", en: "Adult" },
  UNDETERMINED: { pt: "Indeterminado", en: "Undetermined" },
}

// Colunas da planilha: chave interna + cabeçalho por idioma + largura.
const COLUMNS: { key: string; pt: string; en: string; width: number }[] = [
  { key: "controlId", pt: "ID de controle", en: "Control ID", width: 16 },
  { key: "simba", pt: "Nº SIMBA", en: "SIMBA no.", width: 14 },
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
  { key: "notes", pt: "Exame externo", en: "External exam", width: 40 },
]

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "")

function rowFor(a: XlsxAnimal, loc: Loc): Record<string, string | number> {
  const sex = a.sex ? (SEX[a.sex]?.[loc] ?? a.sex) : ""
  const lifeStage = a.lifeStage ? (LIFE_STAGE[a.lifeStage]?.[loc] ?? a.lifeStage) : ""
  const visible = loc === "en" ? (a.isPublic ? "Public" : "Hidden") : a.isPublic ? "Público" : "Oculto"
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
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
