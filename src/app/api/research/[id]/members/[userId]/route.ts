// MARES — Remove um membro (vínculo) de uma pesquisa.
// Regras: admin da org OU criador da pesquisa. O CRIADOR não pode ser removido.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { canManageResearch } from "@/lib/research-access"
import { NotFoundError, ForbiddenError, ConflictError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id, userId } = await params

    const research = await prisma.research.findUnique({
      where: { id },
      select: { id: true, orgId: true, createdById: true },
    })
    if (!research) throw new NotFoundError("Pesquisa não encontrada", ERROR_CODES.researchNotFound)
    requireOrgRole(user, research.orgId, "RESEARCHER")
    if (!canManageResearch(user, research.orgId, research)) {
      throw new ForbiddenError("Sem permissão para gerir membros", ERROR_CODES.forbidden)
    }

    // O criador é membro permanente (mantém acesso pela regra "OU criador").
    if (userId === research.createdById) {
      throw new ConflictError(
        "O criador não pode ser removido da pesquisa",
        ERROR_CODES.researchMemberIsCreator,
      )
    }

    const link = await prisma.researchMember.findUnique({
      where: { researchId_userId: { researchId: id, userId } },
      select: { userId: true },
    })
    if (!link) {
      throw new NotFoundError("Vínculo não encontrado", ERROR_CODES.researchMemberNotFound)
    }

    await prisma.researchMember.delete({
      where: { researchId_userId: { researchId: id, userId } },
    })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
