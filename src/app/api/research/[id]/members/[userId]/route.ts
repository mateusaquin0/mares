// MARES — Remove um membro (vínculo) de uma pesquisa.
//
// Regras: admin da org OU criador da pesquisa podem remover qualquer membro (inclusive o
// criador); a pesquisa pode ficar sem membros. Além disso, **qualquer membro pode sair da
// pesquisa por conta própria** — o vínculo é só escopo de visibilidade, ninguém precisa de
// autorização para deixar de ver dados. Sair não apaga nada: as amostras e análises que a
// pessoa lançou pertencem à PESQUISA, não a ela. Ver docs/PERMISSOES.md §Escopo por pesquisa.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { canManageResearch } from "@/lib/research-access"
import { NotFoundError, ForbiddenError } from "@/lib/errors"
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
    // Sair da própria pesquisa não exige permissão de gestão.
    const isSelf = userId === user.id
    if (!isSelf && !canManageResearch(user, research.orgId, research)) {
      throw new ForbiddenError("Sem permissão para gerir membros", ERROR_CODES.forbidden)
    }

    // Qualquer membro pode ser removido — inclusive o criador. A pesquisa pode ficar sem
    // membros (nesse caso, só o admin da org volta a enxergá-la).
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
