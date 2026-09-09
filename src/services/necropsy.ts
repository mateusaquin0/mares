// MARES — Serviço do laudo anatomopatológico (client).

import { http } from "@/lib/http"
import type {
  GrossFinding,
  HistopathologyFinding,
  NecropsyReport,
  NecropsyScreening,
  NecropsySystemExam,
} from "@/types/necropsy"
import type { DistributionValue, NecropsyStatusValue, SeverityValue } from "@/lib/necropsy-enums"

export type SystemExamPayload = {
  systemId: string
  // null = acrescenta ao laudo como "não avaliado".
  status: NecropsyStatusValue | null
  notExaminedReason: string | null
}

export type GrossFindingPayload = {
  organId: string | null
  tissue: string | null
  site: string | null
  lesion: string
  distribution: DistributionValue | null
  severity: SeverityValue | null
  notes: string | null
  parasitesPresent: boolean | null
  parasitesCollected: boolean | null
  parasiteCount: number | null
}

// A triagem viaja inteira: o PUT substitui o bloco (ver setNecropsyScreeningSchema).
export type ScreeningPayload = NecropsyScreening

export type HistopathologyPayload = {
  organId: string
  finding: string
}

export const necropsyService = {
  get: (animalId: string) => http.get<NecropsyReport>(`/api/animals/${animalId}/necropsy`),

  // Remove o sistema DO LAUDO (não do catálogo). Recusado se houver achados.
  removeSystem: (examId: string) => http.del(`/api/necropsy-systems/exams/${examId}`),

  setScreening: (animalId: string, data: ScreeningPayload) =>
    http.put<NecropsyScreening>(`/api/animals/${animalId}/necropsy/screening`, data),

  setSystem: (animalId: string, data: SystemExamPayload) =>
    http.put<NecropsySystemExam>(`/api/animals/${animalId}/necropsy/systems`, data),

  // O sistema vai no corpo: criar um achado promove o sistema a "com alteração" no mesmo
  // gesto, então a rota precisa saber a qual sistema a linha pertence.
  createFinding: (animalId: string, systemId: string, data: GrossFindingPayload) =>
    http.post<GrossFinding>(`/api/animals/${animalId}/necropsy/findings`, { systemId, ...data }),
  updateFinding: (findingId: string, data: GrossFindingPayload) =>
    http.patch<GrossFinding>(`/api/necropsy-findings/${findingId}`, data),
  removeFinding: (findingId: string) => http.del(`/api/necropsy-findings/${findingId}`),

  createHisto: (animalId: string, data: HistopathologyPayload) =>
    http.post<HistopathologyFinding>(`/api/animals/${animalId}/histopathology`, data),
  updateHisto: (findingId: string, data: HistopathologyPayload) =>
    http.patch<HistopathologyFinding>(`/api/histopathology/${findingId}`, data),
  removeHisto: (findingId: string) => http.del(`/api/histopathology/${findingId}`),
}
