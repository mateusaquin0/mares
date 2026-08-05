// MARES — DTOs do domínio Amostras.

import type { CatalogItem } from "@/types/catalog"

export type SampleStatus = "STORED" | "IN_USE" | "DEPLETED" | "DEGRADED"

// Opção de órgão (catálogo) usada nos formulários de amostra.
export type OrganLite = CatalogItem

// Amostra de um animal (/api/animals/:id/samples).
export type Sample = {
  id: string
  identification: string
  sampleType: string
  collectionDate: string | null
  storageLocation: string | null
  storageTemp: number | null
  status: SampleStatus
  notes: string | null
  // Autor do cadastro; nulo em amostras anteriores à coluna (só admin as exclui).
  createdById: string | null
  organ: OrganLite
  // Pesquisa dona da amostra (uma das pesquisas do indivíduo).
  research: { id: string; name: string }
  _count: { analyses: number }
}
