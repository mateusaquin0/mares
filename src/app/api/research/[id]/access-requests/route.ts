// MARES — Pedido de acesso a uma pesquisa do grupo.
//
// Qualquer membro da organização enxerga o CATÁLOGO de pesquisas (nome/descrição/autor), mas
// os DADOS são só de quem participa. Aqui o pesquisador pede o vínculo; quem gere a pesquisa
// (admin da org ou criador) aprova em PATCH /api/research-access-requests/[requestId].
//
// Autorização: membro da org (RESEARCHER+) da MESMA org da pesquisa.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { requestResearchAccess } from "@/lib/research-requests"
import { apiError, unauthorized } from "@/lib/api"
import { requestResearchAccessSchema } from "@/schemas/research.schema"
import { NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params

    const research = await prisma.research.findUnique({
      where: { id },
      select: { orgId: true },
    })
    if (!research) throw new NotFoundError("Pesquisa não encontrada", ERROR_CODES.researchNotFound)
    requireOrgRole(user, research.orgId, "RESEARCHER")

    const body = await req.json().catch(() => null)
    const { message } = requestResearchAccessSchema.parse(body ?? {})

    await requestResearchAccess(id, user.id, message)
    return new NextResponse(null, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
