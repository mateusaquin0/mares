// MARES — DTOs do domínio Análises (grade dinâmica por amostra × patógeno/exame).

import type { I18nText } from "@/lib/catalog-i18n"

export type ResultValue = "POSITIVO" | "NEGATIVO" | "INCONCLUSIVO"

export type ProtocolEntry = {
  organId: string
  pathogenId: string
  examTypeId: string
  pathogen: { id: string; scientificName: string | null; name: string | I18nText | null }
  examType: { id: string; name: string | I18nText }
}

export type SampleLite = {
  id: string
  sampleType: string
  status: string
  organ: { id: string; name: string | I18nText }
}

export type AnalysisCell = { result: ResultValue | null; ctValue: number | null; notes: string | null }

// Grade de análises (/api/animals/:id/grid).
export type AnalysisGrid = {
  protocol: ProtocolEntry[]
  samples: SampleLite[]
  analyses: (AnalysisCell & { sampleId: string; pathogenId: string; examTypeId: string })[]
}
