// MARES — Serviço de Análises (client). Upsert de uma célula da grade.

import { http } from "@/lib/http"
import type { ResultValue } from "@/types/analysis"

export type AnalysisUpsert = {
  sampleId: string
  pathogenId: string
  examTypeId: string
  result: ResultValue | null
  ctValue: number | null
  notes: string | null
}

export const analysesService = {
  upsert: (data: AnalysisUpsert) => http.put("/api/analyses", data),
}
