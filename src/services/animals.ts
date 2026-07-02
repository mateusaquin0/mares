// MARES — Serviço de Animais (client). Encapsula as chamadas a /api/animals/* e
// endpoints relacionados (mídia, grade de análises, auditoria, SIMBA).

import { http } from "@/lib/http"
import type { CreateAnimalData, UpdateAnimalData } from "@/schemas/animal.schema"
import type {
  AnimalDetail,
  AnimalListItem,
  AnimalMedia,
  AuditEntry,
  SimbaLookup,
} from "@/types/animal"
import type { AnalysisGrid } from "@/types/analysis"

export const animalsService = {
  list: (researchId?: string) =>
    http.get<AnimalListItem[]>(
      `/api/animals${researchId ? `?researchId=${encodeURIComponent(researchId)}` : ""}`
    ),
  get: (id: string) => http.get<AnimalDetail>(`/api/animals/${id}`),
  create: (data: CreateAnimalData) =>
    http.post<{ id: string; species: string }>("/api/animals", data),
  update: (id: string, data: UpdateAnimalData) =>
    http.put<{ id: string; species: string }>(`/api/animals/${id}`, data),
  remove: (id: string) => http.del(`/api/animals/${id}`),

  // SIMBA — busca por número de registro (pré-preenchimento do formulário).
  lookupSimba: (recordNumber: string) =>
    http.get<SimbaLookup>(`/api/simba?record_number=${encodeURIComponent(recordNumber)}`),

  // Mídia
  listMedia: (animalId: string) => http.get<AnimalMedia[]>(`/api/animals/${animalId}/media`),
  uploadMedia: (animalId: string, form: FormData) =>
    http.postForm<AnimalMedia>(`/api/animals/${animalId}/media`, form),
  removeMedia: (mediaId: string) => http.del(`/api/media/${mediaId}`),

  // Grade de análises e auditoria
  getGrid: (animalId: string) => http.get<AnalysisGrid>(`/api/animals/${animalId}/grid`),
  getAudit: (animalId: string) => http.get<AuditEntry[]>(`/api/animals/${animalId}/audit`),
}
