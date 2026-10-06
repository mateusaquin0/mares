// MARES — Serviço de Análises (client). Upsert de célula de rastreio e confirmações de espécie.

import { http } from "@/lib/http"
import type { AnalysisPatch, AnalysisValues } from "@/lib/analyses"
import type { AnalysisSaveStatus } from "@/schemas/analysis.schema"
import type { AnalysisRow, ResultValue } from "@/types/analysis"

// Identifica a célula + APENAS os campos editados. Mandar os três a cada edição deixava um
// estado de tela desatualizado reverter os que o usuário não tocou.
export type AnalysisUpsert = {
  sampleId: string
  pathogenId: string
  examTypeId: string
} & AnalysisPatch

// `saved` = gravou; `unchanged` = nada a gravar (a UI não anuncia salvamento); `cleared` = a
// célula ficou sem dado nenhum e o lançamento foi removido.
export type AnalysisSaveResult = {
  status: AnalysisSaveStatus
  analysis: (AnalysisValues & { id: string }) | null
}

// Um registro de sequenciamento no corpo da confirmação (todos os campos opcionais).
export type SequenceInput = {
  marker: string | null
  accession: string | null
  pctIdentity: number | null
  consensus: string | null
  platform: string | null
}

// Confirmação de espécie (análise-filha de um rastreio positivo).
export type ConfirmationPayload = {
  pathogenId: string
  examTypeId: string
  result: ResultValue | null
  notes: string | null
  sequences: SequenceInput[]
}

export const analysesService = {
  upsert: (data: AnalysisUpsert) => http.put<AnalysisSaveResult>("/api/analyses", data),
  createConfirmation: (parentId: string, data: ConfirmationPayload) =>
    http.post<AnalysisRow>(`/api/analyses/${parentId}/confirmations`, data),
  updateConfirmation: (childId: string, data: ConfirmationPayload) =>
    http.put<AnalysisRow>(`/api/analyses/confirmations/${childId}`, data),
  deleteConfirmation: (childId: string) => http.del(`/api/analyses/confirmations/${childId}`),
}
