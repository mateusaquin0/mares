// MARES — DTOs de Solicitações de glossário (datas em ISO string; payload já validado).

import type { CatalogRequestType, CatalogRequestStatus } from "@prisma/client"

export type { CatalogRequestType, CatalogRequestStatus }

// Corpo do payload de solicitação (mesmos campos do formulário de catálogo).
export type CatalogRequestPayload = {
  namePt?: string
  nameEn?: string
  groupId?: string
  scientificName?: string
  taxonFamily?: string
  taxonOrder?: string
  taxonId?: number | null
  measurePt?: string
  measureEn?: string
  measureUnit?: string
}

export type CatalogRequestItem = {
  id: string
  type: CatalogRequestType
  payload: CatalogRequestPayload
  status: CatalogRequestStatus
  requestedById: string | null
  // Null para revisores que não são admin global (anonimização por grupo).
  requestedByEmail: string | null
  orgId: string | null
  orgName: string | null
  reviewedById: string | null
  reviewedAt: string | null
  reviewNote: string | null
  duplicateOfId: string | null
  createdItemId: string | null
  createdAt: string
  updatedAt: string
}
