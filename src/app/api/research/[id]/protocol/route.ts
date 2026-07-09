// MARES — Protocolo de uma pesquisa (matriz órgão × patógeno × exame): listar e adicionar.
// Ver: qualquer membro. Adicionar: admin da org.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertResearchVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { protocolEntriesSchema } from "@/schemas/research.schema"
import { NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

async function researchOrg(id: string) {
  const r = await prisma.research.findUnique({ where: { id }, select: { orgId: true } })
  if (!r) throw new NotFoundError("Pesquisa não encontrada", ERROR_CODES.researchNotFound)
  return r.orgId
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const orgId = await researchOrg(id)
    requireOrgRole(user, orgId, "RESEARCHER")
    await assertResearchVisible(user, orgId, id)

    const entries = await prisma.researchProtocol.findMany({
      where: { researchId: id },
      orderBy: { id: "asc" },
      select: {
        id: true,
        organ: { select: { id: true, name: true } },
        pathogen: { select: { id: true, scientificName: true, name: true } },
        examType: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(entries)
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    requireOrgRole(user, await researchOrg(id), "ORG_ADMIN")

    const body = await req.json().catch(() => null)
    const { entries } = protocolEntriesSchema.parse(body)

    // Seleção múltipla de patógenos pode reenviar combinações já existentes: ignoramos as
    // duplicatas (unique researchId, organId, pathogenId, examTypeId) em vez de falhar o lote.
    const { count } = await prisma.researchProtocol.createMany({
      data: entries.map((e) => ({ ...e, researchId: id })),
      skipDuplicates: true,
    })

    return NextResponse.json({ added: count }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
