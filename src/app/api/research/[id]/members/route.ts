// MARES — Membros de uma pesquisa (escopo de visibilidade do pesquisador).
// Regras (docs/PERMISSOES.md §Escopo por pesquisa):
//  - Listar: quem enxerga a pesquisa (admin, criador ou membro).
//  - Adicionar/remover: admin da org OU o criador da pesquisa.
//  - Candidato precisa ser pesquisador (Membership) da MESMA org.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { addResearchMemberSchema } from "@/schemas/research.schema"
import { assertResearchVisible, canManageResearch } from "@/lib/research-access"
import { NotFoundError, ForbiddenError, ConflictError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

async function loadResearch(id: string) {
  const research = await prisma.research.findUnique({
    where: { id },
    select: { id: true, orgId: true, createdById: true },
  })
  if (!research) throw new NotFoundError("Pesquisa não encontrada", ERROR_CODES.researchNotFound)
  return research
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const research = await loadResearch(id)
    requireOrgRole(user, research.orgId, "RESEARCHER")
    await assertResearchVisible(user, research.orgId, id)

    const members = await prisma.researchMember.findMany({
      where: { researchId: id },
      orderBy: { createdAt: "asc" },
      select: { userId: true, user: { select: { name: true, email: true, status: true } } },
    })

    return NextResponse.json({
      canManage: canManageResearch(user, research.orgId, research),
      createdById: research.createdById,
      members: members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        status: m.user.status,
        isCreator: m.userId === research.createdById,
      })),
    })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const research = await loadResearch(id)
    requireOrgRole(user, research.orgId, "RESEARCHER")
    if (!canManageResearch(user, research.orgId, research)) {
      throw new ForbiddenError("Sem permissão para gerir membros", ERROR_CODES.forbidden)
    }

    const body = await req.json().catch(() => null)
    const { userId } = addResearchMemberSchema.parse(body)

    // O candidato precisa ser membro (pesquisador ou admin) da mesma org.
    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId: research.orgId } },
      select: { userId: true },
    })
    if (!membership) {
      throw new ForbiddenError(
        "Usuário não é membro da organização",
        ERROR_CODES.researchMemberNotResearcher,
      )
    }

    const exists = await prisma.researchMember.findUnique({
      where: { researchId_userId: { researchId: id, userId } },
      select: { userId: true },
    })
    if (exists) {
      throw new ConflictError("Já é membro da pesquisa", ERROR_CODES.researchMemberExists)
    }

    await prisma.researchMember.create({ data: { researchId: id, userId } })
    return new NextResponse(null, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
