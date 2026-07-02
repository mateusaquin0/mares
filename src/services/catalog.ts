// MARES — Serviço de Catálogos (client).

import { http } from "@/lib/http"
import type { CatalogType } from "@/schemas/catalog.schema"
import type { CatalogItem, CatalogRow, GroupLite, PathogenItem } from "@/types/catalog"

// Corpo de criação/edição de item de catálogo.
export type CatalogItemPayload = {
  namePt?: string
  nameEn?: string
  groupId?: string
  scientificName?: string
}

export const catalogService = {
  // Atalhos por tipo (usados em formulários de amostra/protocolo).
  listOrgans: () => http.get<CatalogItem[]>("/api/catalog/organs"),
  listPathogens: () => http.get<PathogenItem[]>("/api/catalog/pathogens"),
  listExamTypes: () => http.get<CatalogItem[]>("/api/catalog/exam-types"),

  // Gestão genérica de catálogos (CatalogManager).
  list: (type: CatalogType) => http.get<CatalogRow[]>(`/api/catalog/${type}`),
  listPathogenGroups: () => http.get<GroupLite[]>("/api/catalog/pathogen-groups"),
  create: (type: CatalogType, body: CatalogItemPayload) =>
    http.post(`/api/catalog/${type}`, body),
  update: (type: CatalogType, id: string, body: CatalogItemPayload) =>
    http.put(`/api/catalog/${type}/${id}`, body),
  remove: (type: CatalogType, id: string) => http.del(`/api/catalog/${type}/${id}`),
}
