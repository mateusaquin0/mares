// MARES — Criar confirmação de espécie por sequenciamento sob um rastreio positivo.
// POST /api/analyses/:parentId/confirmations
// Regras: qualquer membro da org que enxergue a pesquisa (mesma regra do lançamento de análise).
// A validação do pai (existe, é rastreio, POSITIVO) substitui o gate de protocolo do rastreio.
// Ver docs/PLANO_CONFIRMACAO_SEQUENCIAMENTO.md.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertResearchVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { upsertConfirmationSchema } from "@/schemas/analysis.schema"
import { createConfirmation, loadPositiveParent } from "@/lib/confirmations"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ parentId: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { parentId } = await params

    const parent = await loadPositiveParent(parentId)
    requireOrgRole(user, parent.orgId, "RESEARCHER")
    await assertResearchVisible(user, parent.orgId, parent.researchId)

    const body = await req.json().catch(() => null)
    const data = upsertConfirmationSchema.parse(body)

    const created = await createConfirmation(parent, data)
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
