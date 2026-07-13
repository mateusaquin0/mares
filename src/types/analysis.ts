// MARES — DTOs do domínio Análises (grade dinâmica por amostra × patógeno/exame).

import type { I18nText } from "@/lib/catalog-i18n"

export type ResultValue = "POSITIVO" | "NEGATIVO" | "INCONCLUSIVO"

export type PathogenLite = {
  id: string
  scientificName: string | null
  name: string | I18nText | null
  // Táxon (NCBI) — usado para sugerir espécies da mesma família e decidir se o alvo é amplo
  // (rank acima de espécie) na confirmação.
  taxonFamily?: string | null
  taxonRank?: string | null
  taxonId?: number | null
}

export type ProtocolEntry = {
  organId: string
  pathogenId: string
  examTypeId: string
  status: "ACTIVE" | "INACTIVE"
  pathogen: PathogenLite
  // measureLabel presente = o exame tem leitura quantitativa (ex.: Ct, Título); null = só qualitativo.
  examType: {
    id: string
    name: string | I18nText
    measureLabel: string | I18nText | null
    measureUnit: string | null
  }
}

// Registro de sequenciamento que sustenta a determinação de espécie de uma confirmação.
export type SequenceRecordDTO = {
  id: string
  marker: string | null
  accession: string | null
  pctIdentity: number | null
  consensus: string | null
  platform: string | null
}

export type SampleLite = {
  id: string
  sampleType: string
  status: string
  organ: { id: string; name: string | I18nText }
}

export type AnalysisCell = {
  result: ResultValue | null
  measureValue: number | null
  notes: string | null
}

// Uma análise já persistida na grade. Rastreio: parentAnalysisId = null (casa com um
// ProtocolEntry via sampleId+pathogenId+examTypeId). Confirmação: parentAnalysisId preenchido —
// não casa com protocolo; traz o próprio patógeno/exame (para exibir a espécie) e as sequências.
export type AnalysisRow = AnalysisCell & {
  id: string
  sampleId: string
  pathogenId: string
  examTypeId: string
  parentAnalysisId: string | null
  pathogen: PathogenLite
  examType: { id: string; name: string | I18nText }
  sequences: SequenceRecordDTO[]
}

// Seção da grade referente a UMA pesquisa: seu protocolo aplicado às suas amostras no
// indivíduo. Indivíduos compartilhados têm uma seção por pesquisa (Etapa 2).
export type AnalysisSection = {
  research: { id: string; name: string }
  protocol: ProtocolEntry[]
  samples: SampleLite[]
}

// Grade de análises (/api/animals/:id/grid).
export type AnalysisGrid = {
  sections: AnalysisSection[]
  analyses: AnalysisRow[]
}

// Animal na grade de resultados por pesquisa (/api/research/:id/results).
export type ResultsAnimal = {
  id: string
  controlId: string | null
  simbaRecordNumber: string | null
  species: string
  sex: string | null
  lifeStage: string | null
  municipality: string | null
  state: string | null
  strandingBeach: string | null
  eventDate: string | null
  samples: SampleLite[]
}

// Grade de resultados de UMA pesquisa: um único protocolo aplicado a todos os seus animais.
export type ResearchResults = {
  research: { id: string; name: string }
  protocol: ProtocolEntry[]
  animals: ResultsAnimal[]
  analyses: AnalysisRow[]
}
