// MARES — Decisão sobre um pedido de acesso a pesquisa (aprovar/recusar).
// Quem decide: admin da org OU o criador da pesquisa (canManageResearch), igual à gestão de
// membros — aprovar é exatamente criar o ResearchMember. Ver docs/PERMISSOES.md.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { canManageResearch } from "@/lib/research-access"
import {
  approveResearchAccess,
  loadAccessRequest,
  rejectResearchAccess,
} from "@/lib/research-requests"
import { apiError, unauthorized } from "@/lib/api"
import { reviewAccessRequestSchema } from "@/schemas/research.schema"
import { ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { requestId } = await params
    const request = await loadAccessRequest(requestId)
    requireOrgRole(user, request.research.orgId, "RESEARCHER")

    if (!canManageResearch(user, request.research.orgId, request.research)) {
      throw new ForbiddenError("Sem permissão para revisar o pedido", ERROR_CODES.forbidden)
    }

    const body = await req.json().catch(() => null)
    const { action } = reviewAccessRequestSchema.parse(body)

    if (action === "approve") await approveResearchAccess(requestId, user.id)
    else await rejectResearchAccess(requestId, user.id)

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
