// MARES — Editar/excluir uma confirmação de espécie (análise-filha de sequenciamento).
// PUT    /api/analyses/confirmations/:childId — atualiza espécie/exame/resultado/notas e
//        substitui o conjunto de sequências.
// DELETE /api/analyses/confirmations/:childId — remove a confirmação (sequências caem em cascata).
// Ver docs/PLANO_CONFIRMACAO_SEQUENCIAMENTO.md.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertResearchVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { upsertConfirmationSchema } from "@/schemas/analysis.schema"
import { deleteConfirmation, loadConfirmation, updateConfirmation } from "@/lib/confirmations"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ childId: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { childId } = await params

    const child = await loadConfirmation(childId)
    requireOrgRole(user, child.orgId, "RESEARCHER")
    await assertResearchVisible(user, child.orgId, child.researchId)

    const body = await req.json().catch(() => null)
    const data = upsertConfirmationSchema.parse(body)

    const updated = await updateConfirmation(childId, data)
    return NextResponse.json(updated)
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ childId: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { childId } = await params

    const child = await loadConfirmation(childId)
    requireOrgRole(user, child.orgId, "RESEARCHER")
    await assertResearchVisible(user, child.orgId, child.researchId)

    await deleteConfirmation(childId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
