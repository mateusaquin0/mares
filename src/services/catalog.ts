// MARES — Serviço de Catálogos (client). Expandido conforme os consumidores.

import { http } from "@/lib/http"
import type { CatalogItem, PathogenItem } from "@/types/catalog"

export const catalogService = {
  listOrgans: () => http.get<CatalogItem[]>("/api/catalog/organs"),
  listPathogens: () => http.get<PathogenItem[]>("/api/catalog/pathogens"),
  listExamTypes: () => http.get<CatalogItem[]>("/api/catalog/exam-types"),
}
