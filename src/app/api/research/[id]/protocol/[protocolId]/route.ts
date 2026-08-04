// MARES — Ciclo de vida de uma entrada de protocolo.
//   DELETE — exclusão destrutiva: apaga também as análises da combinação (retroativo).
//            Por ser irreversível, fica restrita ao admin da org ou ao CRIADOR da pesquisa.
//   PATCH  — ativa/desativa: preserva as análises, apenas muda o estado do protocolo.
//            Qualquer pesquisador VINCULADO pode (mesma regra do POST em ../route.ts).
// Ver docs/PLANO_PROTOCOLO_ANALISES.md.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertResearchVisible, canManageResearch } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { NotFoundError, ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { deleteProtocolCascade, setProtocolStatus } from "@/lib/protocols"
import { patchProtocolSchema } from "@/schemas/research.schema"

async function loadEntry(id: string, protocolId: string) {
  const entry = await prisma.researchProtocol.findUnique({
    where: { id: protocolId },
    select: {
      id: true,
      researchId: true,
      organId: true,
      pathogenId: true,
      examTypeId: true,
      research: { select: { orgId: true, createdById: true } },
    },
  })
  if (!entry || entry.researchId !== id) {
    throw new NotFoundError("Entrada do protocolo não encontrada", ERROR_CODES.protocolNotFound)
  }
  return entry
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; protocolId: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id, protocolId } = await params

    const entry = await loadEntry(id, protocolId)
    requireOrgRole(user, entry.research.orgId, "RESEARCHER")
    await assertResearchVisible(user, entry.research.orgId, id)
    // Operação irreversível (apaga análises retroativamente): só admin da org ou criador da
    // pesquisa. Os demais vinculados desativam a entrada (PATCH), que preserva o histórico.
    if (!canManageResearch(user, entry.research.orgId, entry.research)) {
      throw new ForbiddenError(
        "Apenas o administrador da organização ou o criador da pesquisa pode excluir uma entrada do protocolo",
        ERROR_CODES.forbidden,
      )
    }

    await deleteProtocolCascade(entry.id, entry)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; protocolId: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id, protocolId } = await params

    const entry = await loadEntry(id, protocolId)
    requireOrgRole(user, entry.research.orgId, "RESEARCHER")
    await assertResearchVisible(user, entry.research.orgId, id)

    const body = await req.json().catch(() => null)
    const { status } = patchProtocolSchema.parse(body)

    await setProtocolStatus(entry.id, status)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
