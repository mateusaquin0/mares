// MARES — Pronunciamento sobre UM sistema anatômico (upsert por `(animalId, system)`).
// PUT, não POST: a chave é o par animal×sistema, e a tela troca o estado no lugar.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertAnimalVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg } from "@/lib/animals"
import { upsertSystemExamSchema } from "@/schemas/necropsy.schema"
import {
  assertSystemExists,
  findingsPresentError,
  nextSystemPosition,
  systemExamSelect,
} from "@/lib/necropsy"
import { writeAudit } from "@/lib/audit"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, id)

    const body = await req.json().catch(() => null)
    const data = upsertSystemExamSchema.parse(body)
    await assertSystemExists(data.systemId)
    const reason = data.status === "NOT_EXAMINED" ? (data.notExaminedReason ?? null) : null

    const before = await prisma.necropsySystemExam.findUnique({
      where: { animalId_systemId: { animalId: id, systemId: data.systemId } },
      select: { id: true, status: true, _count: { select: { findings: true } } },
    })

    // Rebaixar um sistema COM achados apagaria dado em silêncio — recusa e o usuário remove
    // as linhas primeiro. Ver findingsPresentError.
    if (before && data.status !== "ALTERED" && before._count.findings > 0) {
      throw findingsPresentError(before._count.findings)
    }

    const exam = await prisma.necropsySystemExam.upsert({
      where: { animalId_systemId: { animalId: id, systemId: data.systemId } },
      create: {
        animal: { connect: { id } },
        system: { connect: { id: data.systemId } },
        status: data.status,
        notExaminedReason: reason,
        // Sistema novo entra no fim do laudo: a ordem é a que a necrópsia percorreu.
        position: await nextSystemPosition(id),
      },
      update: { status: data.status, notExaminedReason: reason },
      select: systemExamSelect,
    })

    // O rótulo do log é o nome do sistema no momento da edição — o log precisa continuar
    // legível mesmo se o item do catálogo for renomeado ou excluído depois.
    const label = (exam.system.name as { pt?: string } | null)?.pt ?? exam.system.id
    await writeAudit("NecropsySystemExam", exam.id, user.id, [
      { field: label, oldValue: before?.status ?? null, newValue: data.status },
    ])

    return NextResponse.json(exam, { status: before ? 200 : 201 })
  } catch (err) {
    return apiError(err)
  }
}
