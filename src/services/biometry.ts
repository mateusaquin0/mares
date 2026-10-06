// MARES — Serviço da biometria do indivíduo (client).

import { http } from "@/lib/http"
import type { BiometryPreview, BiometryResponse, BiometryMeasure } from "@/types/biometry"

export type SaveBiometryPayload = {
  group: string | null
  unit: string | null
  measures: BiometryMeasure[]
}

export const biometryService = {
  get: (animalId: string) => http.get<BiometryResponse>(`/api/animals/${animalId}/biometry`),

  // Bloco inteiro numa requisição: a aba é um formulário de ~24 campos, não uma tabela com
  // diálogo por linha.
  save: (animalId: string, data: SaveBiometryPayload) =>
    http.put<BiometryResponse>(`/api/animals/${animalId}/biometry`, data),

  // Só a prévia — quem grava é o `save`, depois da conferência do usuário.
  fromSimba: (animalId: string) =>
    http.post<BiometryPreview>(`/api/animals/${animalId}/biometry/simba`, {}),
}
