// MARES — DTOs do domínio Análises (grade dinâmica por amostra × patógeno/exame).

import type { I18nText } from "@/lib/catalog-i18n"

export type ResultValue = "POSITIVO" | "NEGATIVO" | "INCONCLUSIVO"

export type ProtocolEntry = {
  organId: string
  pathogenId: string
  examTypeId: string
  pathogen: { id: string; scientificName: string | null; name: string | I18nText | null }
  // measureLabel presente = o exame tem leitura quantitativa (ex.: Ct, Título); null = só qualitativo.
  examType: {
    id: string
    name: string | I18nText
    measureLabel: string | I18nText | null
    measureUnit: string | null
  }
}

export type SampleLite = {
  id: string
  sampleType: string
  status: string
  organ: { id: string; name: string | I18nText }
}

export type AnalysisCell = { result: ResultValue | null; measureValue: number | null; notes: string | null }

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
  analyses: (AnalysisCell & { sampleId: string; pathogenId: string; examTypeId: string })[]
}
