// MARES — Helpers de autenticação para Route Handlers e Server Components.
// O papel é POR organização (Membership); o admin global é User.isSystemAdmin.

import { cache } from "react"
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
// Memoizado por request (React.cache): se chamado mais de uma vez no mesmo
// request, o getUser() + a query ao banco só acontecem uma vez.
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient()
  // Verifica o JWT localmente: o projeto usa chaves assimétricas (ES256), então
  // getClaims() valida assinatura + expiração com a JWKS cacheada, sem round-trip
  // ao Auth server (ao contrário de getUser()). Ver docs/NOTES sobre o trade-off.
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims.sub
  if (!userId) return null

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
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
})

// Hierarquia de papéis dentro de uma organização.
const ORG_HIERARCHY: MembershipRole[] = ["RESEARCHER", "ORG_ADMIN"]

export function orgRole(user: AuthUser, orgId: string): MembershipRole | null {
  return user.memberships.find((m) => m.orgId === orgId)?.role ?? null
}

export function requireSystemAdmin(user: AuthUser) {
  if (!user.isSystemAdmin) throw new ForbiddenError()
}

// É admin de alguma organização (ou admin global). Usado para ADICIONAR itens de catálogo
// global — editar/remover fica restrito ao admin global (ver requireSystemAdmin).
export function isAnyOrgAdmin(user: AuthUser): boolean {
  return user.isSystemAdmin || user.memberships.some((m) => m.role === "ORG_ADMIN")
}

export function requireAnyOrgAdmin(user: AuthUser) {
  if (!isAnyOrgAdmin(user)) throw new ForbiddenError()
}

// Curadoria do glossário (fila única): qualquer admin de grupo OU admin global pode
// revisar/aprovar/rejeitar solicitações de item. Mesmo nível de confiança de quem já
// adiciona itens direto (requireAnyOrgAdmin).
export function canReviewCatalogRequest(user: AuthUser): boolean {
  return isAnyOrgAdmin(user)
}

export function requireCatalogReviewer(user: AuthUser) {
  if (!canReviewCatalogRequest(user)) throw new ForbiddenError()
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
  return user.memberships[0]!.orgId // length > 0 garantido pelo guard acima
}
