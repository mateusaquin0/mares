// MARES — Criação de um achado macroscópico (uma linha da tabela do sistema).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertAnimalVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg } from "@/lib/animals"
import { createGrossFindingSchema } from "@/schemas/necropsy.schema"
import {
  assertOrganExists,
  assertSystemExists,
  grossFindingSelect,
  nextGrossPosition,
  nextSystemPosition,
} from "@/lib/necropsy"
import { writeAudit } from "@/lib/audit"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, id)

    const body = await req.json().catch(() => null)
    const { systemId, ...data } = createGrossFindingSchema.parse(body)
    await assertSystemExists(systemId)
    if (data.organId) await assertOrganExists(data.organId)

    // Adicionar linha implica que há alteração: o sistema é criado/promovido a ALTERED no
    // mesmo gesto, em vez de exigir que a pessoa marque o estado antes de poder digitar.
    const exam = await prisma.necropsySystemExam.upsert({
      where: { animalId_systemId: { animalId: id, systemId } },
      create: {
        animal: { connect: { id } },
        system: { connect: { id: systemId } },
        status: "ALTERED",
        position: await nextSystemPosition(id),
      },
      update: { status: "ALTERED", notExaminedReason: null },
      select: { id: true },
    })

    const finding = await prisma.grossFinding.create({
      data: {
        exam: { connect: { id: exam.id } },
        organ: data.organId ? { connect: { id: data.organId } } : undefined,
        tissue: data.tissue ?? null,
        site: data.site ?? null,
        lesion: data.lesion.trim(),
        distribution: data.distribution ?? null,
        severity: data.severity ?? null,
        notes: data.notes ?? null,
        parasitesPresent: data.parasitesPresent ?? null,
        parasitesCollected: data.parasitesCollected ?? null,
        parasiteCount: data.parasiteCount ?? null,
        position: await nextGrossPosition(exam.id),
      },
      select: grossFindingSelect,
    })

    await writeAudit("GrossFinding", finding.id, user.id, [
      { field: "created", oldValue: null, newValue: finding.lesion },
    ])

    return NextResponse.json(finding, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
