// MARES — Ciclo de vida de uma entrada de protocolo (admin da org).
//   DELETE — exclusão destrutiva: apaga também as análises da combinação (retroativo).
//   PATCH  — ativa/desativa: preserva as análises, apenas muda o estado do protocolo.
// Ver docs/PLANO_PROTOCOLO_ANALISES.md.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { NotFoundError } from "@/lib/errors"
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
      research: { select: { orgId: true } },
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
    requireOrgRole(user, entry.research.orgId, "ORG_ADMIN")

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
    requireOrgRole(user, entry.research.orgId, "ORG_ADMIN")

    const body = await req.json().catch(() => null)
    const { status } = patchProtocolSchema.parse(body)

    await setProtocolStatus(entry.id, status)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
