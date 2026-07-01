// MARES — Remover uma entrada do protocolo (admin da org).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; protocolId: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id, protocolId } = await params

    const entry = await prisma.researchProtocol.findUnique({
      where: { id: protocolId },
      select: { id: true, researchId: true, research: { select: { orgId: true } } },
    })
    if (!entry || entry.researchId !== id) {
      throw new NotFoundError("Entrada do protocolo não encontrada", ERROR_CODES.protocolNotFound)
    }
    requireOrgRole(user, entry.research.orgId, "ORG_ADMIN")

    await prisma.researchProtocol.delete({ where: { id: protocolId } })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
