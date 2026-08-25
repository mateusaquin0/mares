// MARES — Editar e excluir um achado histopatológico.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertAnimalVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg } from "@/lib/animals"
import { updateHistopathologyFindingSchema } from "@/schemas/necropsy.schema"
import { assertOrganExists, histopathologySelect, loadHistopathologyFinding } from "@/lib/necropsy"
import { diffFields, writeAudit } from "@/lib/audit"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const existing = await loadHistopathologyFinding(id)
    const animal = await loadAnimalOrg(existing.animalId)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, animal.id)

    const data = updateHistopathologyFindingSchema.parse(await req.json().catch(() => null))
    if (data.organId) await assertOrganExists(data.organId)

    const updated = await prisma.histopathologyFinding.update({
      where: { id },
      data: {
        finding: data.finding?.trim(),
        organ: data.organId ? { connect: { id: data.organId } } : undefined,
      },
      select: histopathologySelect,
    })
    // O órgão fica fora do diff (valor por id, não legível na timeline), como no log de
    // amostra; só o texto do achado entra.
    await writeAudit(
      "HistopathologyFinding",
      id,
      user.id,
      diffFields({ finding: existing.finding }, { finding: updated.finding }, ["finding"]),
    )

    return NextResponse.json(updated)
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const existing = await loadHistopathologyFinding(id)
    const animal = await loadAnimalOrg(existing.animalId)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, animal.id)

    await prisma.histopathologyFinding.delete({ where: { id } })
    await writeAudit("HistopathologyFinding", id, user.id, [
      { field: "deleted", oldValue: existing.finding.slice(0, 120), newValue: null },
    ])

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
