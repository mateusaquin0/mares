// MARES — DTOs do laudo anatomopatológico (macro) e histopatológico (micro).

import type { CatalogItem } from "@/types/catalog"
import type { DistributionValue, NecropsyStatusValue, SeverityValue } from "@/lib/necropsy-enums"

// Uma linha da tabela de achados macroscópicos. Os tri-estados de parasita usam `null`
// como valor de verdade ("não informado"), distinto de `false` ("não").
export type GrossFinding = {
  id: string
  // Topografia dentro do sistema. Órgão é referência ao catálogo (opcional); tecido e local
  // são texto livre.
  organ: CatalogItem | null
  tissue: string | null
  site: string | null
  lesion: string
  distribution: DistributionValue | null
  severity: SeverityValue | null
  notes: string | null
  parasitesPresent: boolean | null
  parasitesCollected: boolean | null
  parasiteCount: number | null
  position: number
}

// Pronunciamento sobre um sistema DENTRO de um laudo. O laudo declara quais sistemas a
// necrópsia cobriu; um sistema do catálogo que não está aqui simplesmente não faz parte
// deste laudo, e um que está aqui sem estado é o "não avaliado" da tela.
export type NecropsySystemExam = {
  id: string
  system: CatalogItem
  // null = "não avaliado" (ver NecropsySystemExam.status no schema).
  status: NecropsyStatusValue | null
  notExaminedReason: string | null
  position: number
  findings: GrossFinding[]
}

export type HistopathologyFinding = {
  id: string
  finding: string
  position: number
  organ: CatalogItem
}

// Resposta de /api/animals/:id/necropsy — o laudo inteiro numa chamada.
export type NecropsyReport = {
  systems: NecropsySystemExam[]
  histopathology: HistopathologyFinding[]
}
