// MARES — Protocolo de uma pesquisa (matriz órgão × patógeno × exame): listar e adicionar.
// Ver e adicionar: quem enxerga a pesquisa — admin da org (todas) ou pesquisador VINCULADO
// (ResearchMember). O protocolo é parte do desenho da pesquisa, então quem toca nos dados dela
// também o define; o escopo por pesquisa (assertResearchVisible) é o que limita o alcance.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertResearchVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { protocolEntriesSchema } from "@/schemas/research.schema"
import { NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { addOrReactivateProtocols } from "@/lib/protocols"

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
        status: true,
        deactivatedAt: true,
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
    const orgId = await researchOrg(id)
    requireOrgRole(user, orgId, "RESEARCHER")
    await assertResearchVisible(user, orgId, id)

    const body = await req.json().catch(() => null)
    const { entries } = protocolEntriesSchema.parse(body)

    // Seleção múltipla de patógenos pode reenviar combinações já existentes. Combinações
    // inéditas são criadas; combinações inativas são REATIVADAS (em vez de duplicar); as já
    // ativas são ignoradas. `added` conta as criadas + reativadas.
    const { affected } = await addOrReactivateProtocols(id, entries)

    return NextResponse.json({ added: affected }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
