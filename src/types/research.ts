// MARES — DTOs do domínio Pesquisas.

import type { CatalogItem, PathogenItem } from "@/types/catalog"

// Entrada do protocolo de uma pesquisa (combinação órgão × patógeno × exame).
export type ProtocolEntry = {
  id: string
  organ: CatalogItem
  pathogen: PathogenItem
  examType: CatalogItem
}

// Item da listagem de pesquisas (/api/research).
export type ResearchListItem = {
  id: string
  name: string
  description: string | null
  isPublic: boolean
  createdById: string | null
  createdAt: string
  _count: { animals: number; protocols: number }
}

// Detalhe de uma pesquisa (/api/research/:id).
export type ResearchDetail = {
  id: string
  name: string
  description: string | null
  isPublic: boolean
  orgId: string
  createdById: string | null
  _count: { animals: number }
  protocols: ProtocolEntry[]
}

// Membro (pesquisador vinculado) de uma pesquisa.
export type ResearchMemberItem = {
  userId: string
  name: string | null
  email: string
  status: string
  isCreator: boolean
}

// Resposta de /api/research/:id/members.
export type ResearchMembers = {
  canManage: boolean
  createdById: string | null
  members: ResearchMemberItem[]
}
