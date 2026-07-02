// MARES — DTOs do domínio Amostras.

import type { CatalogItem } from "@/types/catalog"

export type SampleStatus = "STORED" | "IN_USE" | "DEPLETED" | "DEGRADED"

// Opção de órgão (catálogo) usada nos formulários de amostra.
export type OrganLite = CatalogItem

// Amostra de um animal (/api/animals/:id/samples).
export type Sample = {
  id: string
  sampleType: string
  collectionDate: string | null
  storageLocation: string | null
  storageTemp: number | null
  status: SampleStatus
  notes: string | null
  organ: OrganLite
  _count: { analyses: number }
}
