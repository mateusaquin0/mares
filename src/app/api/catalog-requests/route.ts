// MARES — Solicitações de glossário: abrir (qualquer autenticado) e listar a fila (curador).
// Curador = qualquer admin de grupo OU admin global (fila única). O e-mail do solicitante só
// é revelado ao admin global; para os demais a solicitação aparece anonimizada por grupo.

import { NextRequest, NextResponse } from "next/server"
import type { CatalogRequestStatus } from "@prisma/client"
import { getAuthUser, getActiveOrgId, requireCatalogReviewer } from "@/lib/auth"
import { apiError, tooManyRequests, unauthorized } from "@/lib/api"
import { rateLimit } from "@/lib/rate-limit"
import { createCatalogRequestSchema } from "@/schemas/catalog-request.schema"
import {
  createCatalogRequest,
  listReviewableRequests,
  type CatalogRequestRow,
} from "@/lib/catalog-requests"

// Remove o e-mail do solicitante para quem não é admin global (anonimização por grupo).
function toDto(r: CatalogRequestRow, showEmail: boolean) {
  return { ...r, requestedByEmail: showEmail ? r.requestedByEmail : null }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    // Limite por usuário para conter abuso/spam.
    const limit = rateLimit(`catalog-request:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 })
    if (!limit.ok) return tooManyRequests(limit.retryAfter)

    const body = createCatalogRequestSchema.parse(await req.json().catch(() => null))
    const orgId = await getActiveOrgId(user)
    const orgName = orgId
      ? (user.memberships.find((m) => m.orgId === orgId)?.orgName ?? null)
      : null

    const created = await createCatalogRequest({
      type: body.type,
      payload: body.payload,
      userId: user.id,
      userEmail: user.email,
      orgId,
      orgName,
    })
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireCatalogReviewer(user)

    const statusParam = req.nextUrl.searchParams.get("status")
    const valid: CatalogRequestStatus[] = ["PENDING", "APPROVED", "REJECTED"]
    const status = valid.includes(statusParam as CatalogRequestStatus)
      ? (statusParam as CatalogRequestStatus)
      : "PENDING"

    const rows = await listReviewableRequests(status)
    return NextResponse.json(rows.map((r) => toDto(r, user.isSystemAdmin)))
  } catch (err) {
    return apiError(err)
  }
}
