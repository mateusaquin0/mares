// MARES — DTOs do domínio Pesquisas.

import type { CatalogItem, PathogenItem } from "@/types/catalog"

export type ProtocolStatus = "ACTIVE" | "INACTIVE"

// Entrada do protocolo de uma pesquisa (combinação órgão × patógeno × exame).
export type ProtocolEntry = {
  id: string
  status: ProtocolStatus
  deactivatedAt: string | null
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

export type AccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED"

// Item do catálogo (/api/research/catalog): TODAS as pesquisas do grupo. Para quem não é
// membro vêm só os metadados — `_count` é null e os dados seguem inacessíveis.
export type ResearchCatalogItem = {
  id: string
  name: string
  description: string | null
  isPublic: boolean
  createdById: string | null
  createdBy: { name: string | null; email: string } | null
  // Vínculo real (ResearchMember) — governa o selo "participa" e a ação de sair.
  isMember: boolean
  // Enxerga os dados: por vínculo OU por ser admin da org (que não é membro de nada).
  canSeeData: boolean
  _count: { animals: number; protocols: number } | null
  // Estado do pedido do PRÓPRIO usuário para esta pesquisa (null = nunca pediu).
  requestStatus: AccessRequestStatus | null
}

// Pedido de acesso pendente na fila de quem revisa (/api/research-access-requests).
export type AccessRequestItem = {
  id: string
  message: string | null
  createdAt: string
  research: { id: string; name: string }
  user: { id: string; name: string | null; email: string }
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
