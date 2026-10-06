// MARES — Criação de um achado histopatológico ("Órgão: X. Achado: Y.").

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertAnimalVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg } from "@/lib/animals"
import { createHistopathologyFindingSchema } from "@/schemas/necropsy.schema"
import { assertOrganExists, histopathologySelect, nextHistopathologyPosition } from "@/lib/necropsy"
import { writeAudit } from "@/lib/audit"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, id)

    const data = createHistopathologyFindingSchema.parse(await req.json().catch(() => null))
    await assertOrganExists(data.organId)

    // Sem unicidade por (animal, órgão): o mesmo órgão pode render mais de uma linha
    // (fragmentos distintos, achados de naturezas diferentes), como na planilha de origem.
    const finding = await prisma.histopathologyFinding.create({
      data: {
        animal: { connect: { id } },
        organ: { connect: { id: data.organId } },
        finding: data.finding.trim(),
        position: await nextHistopathologyPosition(id),
      },
      select: histopathologySelect,
    })

    await writeAudit("HistopathologyFinding", finding.id, user.id, [
      { field: "created", oldValue: null, newValue: finding.finding.slice(0, 120) },
    ])

    return NextResponse.json(finding, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
