// MARES — Serviço de Pesquisas e Protocolos (client).

import { http } from "@/lib/http"
import type { CreateResearchData, UpdateResearchData } from "@/schemas/research.schema"
import type { ResearchDetail, ResearchListItem, ResearchMembers } from "@/types/research"
import type { ResearchResults } from "@/types/analysis"

export type ProtocolEntryInput = { organId: string; pathogenId: string; examTypeId: string }

export const researchService = {
  list: () => http.get<ResearchListItem[]>("/api/research"),
  get: (id: string) => http.get<ResearchDetail>(`/api/research/${id}`),
  results: (id: string) => http.get<ResearchResults>(`/api/research/${id}/results`),
  create: (data: CreateResearchData) =>
    http.post<{ id: string; name: string }>("/api/research", data),
  update: (id: string, data: UpdateResearchData) => http.put(`/api/research/${id}`, data),
  remove: (id: string) => http.del(`/api/research/${id}`),

  addProtocol: (id: string, entries: ProtocolEntryInput[]) =>
    http.post<{ added: number }>(`/api/research/${id}/protocol`, { entries }),
  setProtocolStatus: (id: string, entryId: string, status: "ACTIVE" | "INACTIVE") =>
    http.patch(`/api/research/${id}/protocol/${entryId}`, { status }),
  removeProtocol: (id: string, entryId: string) =>
    http.del(`/api/research/${id}/protocol/${entryId}`),

  members: (id: string) => http.get<ResearchMembers>(`/api/research/${id}/members`),
  addMember: (id: string, userId: string) => http.post(`/api/research/${id}/members`, { userId }),
  removeMember: (id: string, userId: string) => http.del(`/api/research/${id}/members/${userId}`),
}
