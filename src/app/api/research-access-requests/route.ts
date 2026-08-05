// MARES — Fila consolidada dos pedidos de acesso a pesquisas que o usuário pode revisar.
// Admin da org revisa os pedidos de todas as pesquisas do grupo; o pesquisador, os das
// pesquisas que criou (mesma regra de canManageResearch). Ver docs/PERMISSOES.md.

import { NextResponse } from "next/server"
import { getAuthUser, getActiveOrgId, requireOrgRole, orgRole } from "@/lib/auth"
import { listReviewableAccessRequests } from "@/lib/research-requests"
import { apiError, unauthorized } from "@/lib/api"

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const orgId = await getActiveOrgId(user)
    if (!orgId) return NextResponse.json([])
    requireOrgRole(user, orgId, "RESEARCHER")

    const isOrgAdmin = orgRole(user, orgId) === "ORG_ADMIN"
    return NextResponse.json(await listReviewableAccessRequests(orgId, user.id, isOrgAdmin))
  } catch (err) {
    return apiError(err)
  }
}
