// MARES — Tira um sistema DO LAUDO de um indivíduo (o catálogo continua intacto).
//
// É o inverso de "adicionar sistema ao laudo": desfaz a decisão de que aquela necrópsia
// cobriria o sistema. Recusado se houver achados — apagá-los junto seria perder dado em
// silêncio, a mesma regra do rebaixamento de estado.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertAnimalVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg } from "@/lib/animals"
import { findingsPresentError, loadSystemExam } from "@/lib/necropsy"
import { writeAudit } from "@/lib/audit"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const exam = await loadSystemExam(id)
    const animal = await loadAnimalOrg(exam.animalId)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, animal.id)

    if (exam._count.findings > 0) throw findingsPresentError(exam._count.findings)

    await prisma.necropsySystemExam.delete({ where: { id } })

    const label = (exam.system.name as { pt?: string } | null)?.pt ?? exam.systemId
    await writeAudit("NecropsySystemExam", id, user.id, [
      { field: label, oldValue: exam.status, newValue: null },
    ])

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
