// MARES — Serviço de Amostras (client).

import { http } from "@/lib/http"
import type { Sample } from "@/types/sample"

// Payload de criação/edição de amostra (campos já normalizados no formulário).
export type SamplePayload = {
  organId: string
  identification: string
  sampleType: string
  collectionDate: string | null
  storageLocation: string | null
  storageTemp: number | null
  status: Sample["status"]
  notes: string | null
}

export const samplesService = {
  listByAnimal: (animalId: string) => http.get<Sample[]>(`/api/animals/${animalId}/samples`),
  create: (animalId: string, data: SamplePayload) =>
    http.post<Sample>(`/api/animals/${animalId}/samples`, data),
  update: (sampleId: string, data: SamplePayload) =>
    http.put<Sample>(`/api/samples/${sampleId}`, data),
  remove: (sampleId: string) => http.del(`/api/samples/${sampleId}`),
}
