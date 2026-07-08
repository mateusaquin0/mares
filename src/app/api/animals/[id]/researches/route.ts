// MARES — Compartilhamento de um indivíduo entre pesquisas do mesmo grupo (Etapa 1).
// POST adiciona uma pesquisa (da org) como participante do indivíduo. Ver docs/PERMISSOES.md.
// Autorização: membro da org (RESEARCHER+), igual ao cadastro/edição do animal.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertAnimalVisible, assertResearchVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { addAnimalResearch, loadAnimalOrg } from "@/lib/animals"
import { ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, id)

    const body = await req.json().catch(() => null)
    const researchId = typeof body?.researchId === "string" ? body.researchId.trim() : ""
    if (!researchId) throw new ValidationError("researchId é obrigatório", ERROR_CODES.validation)
    // O pesquisador só compartilha o indivíduo com pesquisas que enxerga.
    await assertResearchVisible(user, animal.orgId, researchId)

    await addAnimalResearch(id, animal.orgId, researchId)
    return new NextResponse(null, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
