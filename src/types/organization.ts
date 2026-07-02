// MARES — DTOs do domínio Organizações e Membros.

export type OrgMemberRole = "ORG_ADMIN" | "RESEARCHER"

// Membro de uma organização (/api/organizations/:orgId/members).
export type Member = {
  userId: string
  name: string | null
  email: string
  status: string
  role: OrgMemberRole
}

// Vínculo do usuário com uma organização (usado em "Minhas organizações").
export type Membership = {
  orgId: string
  orgName: string
  role: OrgMemberRole
}

// Dados editáveis de uma organização (/api/organizations/:orgId).
export type OrgDetail = {
  name: string
  city: string | null
  state: string | null
  country: string | null
}
