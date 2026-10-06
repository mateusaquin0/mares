// MARES — Exportação de animais em Excel (.xlsx) (Fase 6). Gera uma planilha tabular com
// os animais selecionados. Cabeçalhos e rótulos (sexo, estágio de vida, visibilidade) são
// localizados (pt/en). Roda no runtime Node da rota de exportação.

import ExcelJS from "exceljs"

import { txt, pathogenName, type I18nText } from "@/lib/catalog-i18n"
import { buildDescriptiveDiagnosis } from "@/lib/necropsy-report"
import { normalizeLabel, unitForMeasure, withWeight } from "@/lib/biometry"
import type { AnimalBiometry } from "@/types/biometry"
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

// Uma linha da tabela de achados macroscópicos, já dentro do sistema a que pertence.
export type XlsxGrossFinding = {
  position: number
  organ: { name: unknown } | null
  tissue: string | null
  site: string | null
  lesion: string
  distribution: string | null
  severity: string | null
  notes: string | null
  parasitesPresent: boolean | null
  parasitesCollected: boolean | null
  parasiteCount: number | null
}

export type XlsxSystemExam = {
  status: string | null
  notExaminedReason: string | null
  position: number
  system: { name: unknown }
  findings: XlsxGrossFinding[]
}

export type XlsxHistopathology = {
  position: number
  finding: string
  organ: { name: unknown }
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
  species: string | null
  taxonFamily: string | null
  taxonOrder: string | null
  sex: string | null
  lifeStage: string | null
  bodyCondition: string | null
  decompositionStage: string | null
  deathCondition: string | null
  eventDate: Date | null
  necropsyDate: Date | null
  necropsyWeightKg: number | null
  municipality: string | null
  state: string | null
  executingInstitution: string | null
  strandingBeach: string | null
  strandingLat: number | null
  strandingLon: number | null
  isPublic: boolean
  macroscopicNotes: string | null
  // Triagem da carcaça: as quatro perguntas tri-estado e as interações encontradas.
  anthropicInteraction: boolean | null
  giContentCollected: boolean | null
  giSolidWaste: boolean | null
  giDetailedScreening: boolean | null
  anthropicInteractions: { type: string; degree: number }[]
  research: { name: string }
  _count: { samples: number }
  samples: XlsxSample[]
  // Laudo anatomopatológico: macro por sistema e micro por órgão.
  necropsySystems: XlsxSystemExam[]
  histopathology: XlsxHistopathology[]
  // Biometria (PMP > Biometria do SIMBA). Já convertida de Prisma.JsonValue pelo chamador.
  biometry: AnimalBiometry | null
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
// Vocabulários do laudo. O Excel não passa pelo next-intl, então os rótulos vivem aqui,
// chaveados pelo mesmo valor canônico gravado no banco (src/lib/necropsy-enums.ts).
const NECROPSY_STATUS: Record<string, { pt: string; en: string }> = {
  ALTERED: { pt: "Com alteração", en: "Altered" },
  NO_CHANGE: { pt: "Sem alteração", en: "No change" },
  NOT_EXAMINED: { pt: "Não examinado", en: "Not examined" },
}
const DISTRIBUTION: Record<string, { pt: string; en: string }> = {
  focal: { pt: "Focal", en: "Focal" },
  multifocal: { pt: "Multifocal", en: "Multifocal" },
  multifocal_coalescing: { pt: "Multifocal a coalescente", en: "Multifocal to coalescing" },
  locally_extensive: { pt: "Focalmente extensa", en: "Locally extensive" },
  segmental: { pt: "Segmentar", en: "Segmental" },
  diffuse: { pt: "Difusa", en: "Diffuse" },
  generalized: { pt: "Generalizada", en: "Generalized" },
}
// `marked` é o valor gravado do grau máximo; o rótulo é "severo" (ver necropsy-enums.ts).
const SEVERITY: Record<string, { pt: string; en: string }> = {
  mild: { pt: "Discreto", en: "Mild" },
  mild_moderate: { pt: "Discreto a moderado", en: "Mild to moderate" },
  moderate: { pt: "Moderado", en: "Moderate" },
  moderate_severe: { pt: "Moderado a severo", en: "Moderate to severe" },
  marked: { pt: "Severo", en: "Severe" },
}
const INTERACTION: Record<string, { pt: string; en: string }> = {
  FISHERY: { pt: "Pesca", en: "Fishery" },
  WASTE: { pt: "Resíduo", en: "Debris" },
  AGGRESSION: { pt: "Agressão / vandalismo / caça", en: "Aggression / vandalism / hunting" },
  VESSEL: { pt: "Embarcações", en: "Vessels" },
}
// `null` é "não informado", e não "não" — a distinção tem de sobreviver à exportação.
const NOT_INFORMED: Record<Loc, string> = { pt: "Não informado", en: "Not informed" }
const YES_NO: Record<Loc, { yes: string; no: string }> = {
  pt: { yes: "Sim", no: "Não" },
  en: { yes: "Yes", no: "No" },
}
const NOT_ASSESSED: Record<Loc, string> = { pt: "Não avaliado", en: "Not assessed" }

const vocab = (map: Record<string, { pt: string; en: string }>, v: string | null, loc: Loc) =>
  v ? (map[v]?.[loc] ?? v) : ""
const tri = (v: boolean | null, loc: Loc) =>
  v === null ? NOT_INFORMED[loc] : v ? YES_NO[loc].yes : YES_NO[loc].no

// Interações numa célula só: "Pesca (grau 2); Embarcações (grau 1)". Uma coluna por tipo
// deixaria quatro colunas quase sempre vazias — a planilha já tem 24.
const interactionList = (
  interactions: readonly { type: string; degree: number }[],
  loc: Loc,
): string =>
  interactions
    .map((i) => `${INTERACTION[i.type]?.[loc] ?? i.type} (${DEGREE[loc]} ${i.degree})`)
    .join("; ")

const DEGREE: Record<Loc, string> = { pt: "grau", en: "degree" }

// Rótulo de espécie indeterminada (null) na planilha.
const UNDETERMINED_SPECIES: Record<Loc, string> = { pt: "Indeterminado", en: "Undetermined" }

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
  { key: "eventDate", pt: "Data da ocorrência", en: "Occurrence date", width: 16 },
  { key: "necropsyDate", pt: "Data de necrópsia", en: "Necropsy date", width: 16 },
  { key: "necropsyWeight", pt: "Peso na necrópsia (kg)", en: "Necropsy weight (kg)", width: 20 },
  { key: "municipality", pt: "Município", en: "Municipality", width: 18 },
  { key: "state", pt: "Estado", en: "State", width: 10 },
  { key: "beach", pt: "Praia", en: "Beach", width: 20 },
  {
    key: "executingInstitution",
    pt: "Instituição executora",
    en: "Executing institution",
    width: 28,
  },
  { key: "lat", pt: "Latitude", en: "Latitude", width: 12 },
  { key: "lon", pt: "Longitude", en: "Longitude", width: 12 },
  { key: "research", pt: "Pesquisa", en: "Research", width: 24 },
  { key: "visibility", pt: "Visibilidade", en: "Visibility", width: 12 },
  { key: "samples", pt: "Amostras", en: "Samples", width: 10 },
  { key: "positives", pt: "Patógenos positivos", en: "Positive pathogens", width: 32 },
  {
    key: "anthropicInteraction",
    pt: "Indícios de interação antrópica",
    en: "Evidence of anthropogenic interaction",
    width: 28,
  },
  {
    key: "anthropicInteractions",
    pt: "Interações antrópicas (grau)",
    en: "Anthropogenic interactions (degree)",
    width: 36,
  },
  {
    key: "giContentCollected",
    pt: "Coleta de conteúdo gastrointestinal",
    en: "Gastrointestinal content collected",
    width: 30,
  },
  {
    key: "giSolidWaste",
    pt: "Presença de resíduos sólidos",
    en: "Solid debris present",
    width: 24,
  },
  {
    key: "giDetailedScreening",
    pt: "Triagem detalhada do conteúdo gastrointestinal",
    en: "Detailed screening of gastrointestinal content",
    width: 36,
  },
  { key: "notes", pt: "Observações", en: "Observations", width: 40 },
  {
    key: "descriptiveDiagnosis",
    pt: "Diagnóstico descritivo",
    en: "Descriptive diagnosis",
    width: 60,
  },
]

// Colunas do laudo (macro e micro na MESMA aba). É a união das duas listas, com `exam`
// discriminando a origem — no Excel se filtra por essa coluna. As colunas específicas do
// macro ficam vazias nas linhas de histopatologia, e vice-versa.
const REPORT_COLUMNS: { key: string; pt: string; en: string; width: number }[] = [
  { key: "animal", pt: "Animal", en: "Animal", width: 16 },
  { key: "species", pt: "Espécie", en: "Species", width: 24 },
  { key: "exam", pt: "Exame", en: "Exam", width: 18 },
  { key: "system", pt: "Sistema", en: "System", width: 24 },
  { key: "status", pt: "Estado do sistema", en: "System state", width: 18 },
  { key: "number", pt: "Nº", en: "No.", width: 6 },
  { key: "organ", pt: "Órgão", en: "Organ", width: 20 },
  { key: "tissue", pt: "Tecido", en: "Tissue", width: 18 },
  { key: "site", pt: "Local", en: "Site", width: 18 },
  { key: "lesion", pt: "Lesão / alteração", en: "Lesion / change", width: 28 },
  { key: "distribution", pt: "Distribuição", en: "Distribution", width: 20 },
  { key: "severity", pt: "Severidade", en: "Severity", width: 14 },
  { key: "finding", pt: "Achado / observações", en: "Finding / notes", width: 60 },
  { key: "parasitesPresent", pt: "Presença de parasitas", en: "Parasites present", width: 18 },
  { key: "parasitesCollected", pt: "Parasitas coletados", en: "Parasites collected", width: 18 },
  { key: "parasiteCount", pt: "Quantidade", en: "Count", width: 12 },
]

// Rótulo do discriminador.
const EXAM_KIND: Record<"gross" | "histo", { pt: string; en: string }> = {
  gross: { pt: "Macroscópico", en: "Gross" },
  histo: { pt: "Histopatológico", en: "Histopathology" },
}

// Colunas da aba de análises (uma linha por análise).
const ANALYSIS_COLUMNS: { key: string; pt: string; en: string; width: number }[] = [
  { key: "animal", pt: "Animal", en: "Animal", width: 16 },
  { key: "species", pt: "Espécie", en: "Species", width: 24 },
  { key: "sample", pt: "Amostra", en: "Sample", width: 16 },
  { key: "research", pt: "Pesquisa", en: "Research", width: 24 },
  { key: "organ", pt: "Material biológico", en: "Biological material", width: 22 },
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
    species: a.species ?? UNDETERMINED_SPECIES[loc],
    family: a.taxonFamily ?? "",
    order: a.taxonOrder ?? "",
    sex,
    lifeStage,
    bodyCondition: a.bodyCondition ?? "",
    decomposition: a.decompositionStage ?? "",
    deathCondition: a.deathCondition ?? "",
    eventDate: isoDate(a.eventDate),
    necropsyDate: isoDate(a.necropsyDate),
    necropsyWeight: a.necropsyWeightKg ?? "",
    municipality: a.municipality ?? "",
    state: a.state ?? "",
    beach: a.strandingBeach ?? "",
    executingInstitution: a.executingInstitution ?? "",
    lat: a.strandingLat ?? "",
    lon: a.strandingLon ?? "",
    research: a.research.name,
    visibility: visible,
    samples: a._count.samples,
    positives: positivePathogens(a, loc),
    anthropicInteraction: tri(a.anthropicInteraction, loc),
    anthropicInteractions: interactionList(a.anthropicInteractions, loc),
    giContentCollected: tri(a.giContentCollected, loc),
    giSolidWaste: tri(a.giSolidWaste, loc),
    giDetailedScreening: tri(a.giDetailedScreening, loc),
    notes: a.macroscopicNotes ?? "",
    // Derivado dos achados micro, no formato corrido do SIMBA — mesma função que a tela usa.
    descriptiveDiagnosis: buildDescriptiveDiagnosis(loc, a.histopathology),
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

  // Aba do laudo: macro e micro juntos, um bloco por animal — primeiro os achados
  // macroscópicos (na ordem dos sistemas do laudo), depois os histopatológicos.
  const wsR = wb.addWorksheet(loc === "en" ? "Pathology report" : "Laudo")
  wsR.columns = REPORT_COLUMNS.map((c) => ({ header: c[loc], key: c.key, width: c.width }))
  wsR.getRow(1).font = { bold: true }
  wsR.views = [{ state: "frozen", ySplit: 1 }]
  for (const a of animals) {
    const animalLabel = a.controlId ?? a.simbaRecordNumber ?? ""
    const species = a.species ?? UNDETERMINED_SPECIES[loc]

    for (const e of a.necropsySystems) {
      const base = {
        animal: animalLabel,
        species,
        exam: EXAM_KIND.gross[loc],
        system: txt(loc, asI18n(e.system.name)),
        status: e.status ? vocab(NECROPSY_STATUS, e.status, loc) : NOT_ASSESSED[loc],
      }
      // Sistema sem achados ("sem alteração", "não examinado" ou ainda não avaliado) também
      // vira linha: a ausência de achado é informação de laudo, não ausência de dado.
      if (e.findings.length === 0) {
        wsR.addRow({ ...base, finding: e.notExaminedReason ?? "" })
        continue
      }
      for (const g of e.findings) {
        wsR.addRow({
          ...base,
          number: g.position,
          organ: g.organ ? txt(loc, asI18n(g.organ.name)) : "",
          tissue: g.tissue ?? "",
          site: g.site ?? "",
          lesion: g.lesion,
          distribution: vocab(DISTRIBUTION, g.distribution, loc),
          severity: vocab(SEVERITY, g.severity, loc),
          finding: g.notes ?? "",
          parasitesPresent: tri(g.parasitesPresent, loc),
          parasitesCollected: tri(g.parasitesCollected, loc),
          parasiteCount: g.parasiteCount ?? NOT_INFORMED[loc],
        })
      }
    }

    for (const h of a.histopathology) {
      wsR.addRow({
        animal: animalLabel,
        species,
        exam: EXAM_KIND.histo[loc],
        number: h.position,
        organ: txt(loc, asI18n(h.organ.name)),
        finding: h.finding,
      })
    }
  }

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
          species: a.species ?? UNDETERMINED_SPECIES[loc],
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

  addBiometrySheet(wb, animals, loc)

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

/**
 * Aba de biometria: uma LINHA por indivíduo e uma COLUNA por medida — o formato que alimenta
 * análise de crescimento e condição corporal direto no R/Excel, sem pivotar.
 *
 * As colunas não saem de uma lista fixa (não existe catálogo de medidas — ver
 * docs/PLANO_BIOMETRIA.md): são descobertas varrendo os animais do recorte, agrupadas por
 * FORMULÁRIO, porque medidas de odontoceto e de quelônio não se comparam e misturá-las numa
 * planilha só produziria uma matriz esparsa ilegível.
 */
function addBiometrySheet(wb: ExcelJS.Workbook, animals: XlsxAnimal[], loc: Loc): void {
  const withBio = animals.filter((a) => a.biometry && a.biometry.measures.length > 0)
  if (withBio.length === 0) return

  const ws = wb.addWorksheet(loc === "en" ? "Biometrics" : "Biometria")
  // Ordem das colunas = ordem do formulário do SIMBA (sequência anatômica), tomada do
  // primeiro animal em que cada rótulo aparece. Alfabético embaralharia.
  const labels = new Map<string, string>()
  for (const a of withBio) {
    for (const m of a.biometry!.measures) {
      const key = normalizeLabel(m.label)
      if (key && !labels.has(key)) labels.set(key, m.label)
    }
  }
  const cols = [...labels.entries()]

  ws.columns = [
    { header: loc === "en" ? "Individual" : "Indivíduo", key: "animal", width: 18 },
    { header: loc === "en" ? "Species" : "Espécie", key: "species", width: 24 },
    { header: loc === "en" ? "Form" : "Formulário", key: "group", width: 16 },
    ...cols.map(([key, label], i) => ({
      // O cabeçalho leva a unidade, que não vive na medida — é derivada do rótulo na
      // exibição (ver lib/biometry.ts §unitForMeasure).
      header: `${label} (${unitForMeasure(label, withBio[0]?.biometry?.unit)})`,
      key: `m${i}_${key.slice(0, 20)}`,
      width: 18,
    })),
  ]
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: "frozen", ySplit: 1 }]

  for (const a of withBio) {
    const bio = a.biometry!
    // O peso vive na coluna do animal, não no JSON — recolocado no slot do rótulo para a
    // planilha sair na ordem do formulário.
    const byLabel = new Map(
      withWeight(bio.measures, a.necropsyWeightKg).map((m) => [normalizeLabel(m.label), m.value]),
    )
    const row: Record<string, string | number> = {
      animal: a.controlId ?? a.simbaRecordNumber ?? "",
      species: a.species ?? UNDETERMINED_SPECIES[loc],
      group: bio.group ?? "",
    }
    cols.forEach(([key], i) => {
      const v = byLabel.get(key)
      // Célula vazia = "Não informado". Distinguir de zero importa: zero dente é achado.
      row[`m${i}_${key.slice(0, 20)}`] = v == null ? "" : v
    })
    ws.addRow(row)
  }
}
