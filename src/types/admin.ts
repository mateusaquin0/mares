// MARES — DTOs da área de administração global.

import type { Member } from "@/types/organization"

// Usuário na listagem global (/api/admin/users).
export type AdminUser = {
  id: string
  email: string
  name: string | null
  isSystemAdmin: boolean
  status: string
  memberships: { orgId: string; orgName: string; role: string }[]
}

// Solicitação de acesso pendente (/api/admin/access-requests).
export type JoinRequest = {
  id: string
  email: string
  requesterName: string
  organizationName: string
  status: string
  createdAt: string
}

// Organização na listagem global (/api/admin/organizations).
export type AdminOrg = {
  id: string
  name: string
  city: string | null
  state: string | null
  country: string | null
  deactivatedAt: string | null
  createdAt: string
  researchCount: number
  members: Member[]
}
