// MARES — Helpers de autenticação para Route Handlers e Server Components.
// O papel é POR organização (Membership); o admin global é User.isSystemAdmin.

import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { ForbiddenError } from "@/lib/errors"
import type { MembershipRole } from "@prisma/client"

export const ACTIVE_ORG_COOKIE = "mares-active-org"

export type AuthMembership = { orgId: string; orgName: string; role: MembershipRole }

export type AuthUser = {
  id: string
  email: string
  name: string | null
  isSystemAdmin: boolean
  memberships: AuthMembership[]
}

// Valida a sessão e retorna o usuário do banco com seus vínculos (ou null).
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      isSystemAdmin: true,
      memberships: {
        select: { orgId: true, role: true, organization: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  })
  if (!dbUser) return null

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    isSystemAdmin: dbUser.isSystemAdmin,
    memberships: dbUser.memberships.map((m) => ({
      orgId: m.orgId,
      orgName: m.organization.name,
      role: m.role,
    })),
  }
}

// Hierarquia de papéis dentro de uma organização.
const ORG_HIERARCHY: MembershipRole[] = ["RESEARCHER", "ORG_ADMIN"]

export function orgRole(user: AuthUser, orgId: string): MembershipRole | null {
  return user.memberships.find((m) => m.orgId === orgId)?.role ?? null
}

export function requireSystemAdmin(user: AuthUser) {
  if (!user.isSystemAdmin) throw new ForbiddenError()
}

// Exige um papel mínimo na organização. O admin global NÃO participa de organizações e,
// portanto, NÃO satisfaz verificações de papel de org (ele usa as rotas /api/admin/*).
export function requireOrgRole(user: AuthUser, orgId: string, minRole: MembershipRole) {
  const role = orgRole(user, orgId)
  if (!role || ORG_HIERARCHY.indexOf(role) < ORG_HIERARCHY.indexOf(minRole)) {
    throw new ForbiddenError()
  }
}

// Organização ativa (cookie), validada contra os vínculos do usuário.
export async function getActiveOrgId(user: AuthUser): Promise<string | null> {
  if (user.memberships.length === 0) return null
  const cookieStore = await cookies()
  const cookieOrg = cookieStore.get(ACTIVE_ORG_COOKIE)?.value
  if (cookieOrg && user.memberships.some((m) => m.orgId === cookieOrg)) return cookieOrg
  return user.memberships[0].orgId
}
