// MARES — Editar e excluir um achado macroscópico.
// O animal é resolvido a partir do achado (achado → exame → animal) antes das guardas.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertAnimalVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg } from "@/lib/animals"
import { updateGrossFindingSchema } from "@/schemas/necropsy.schema"
import { assertOrganExists, grossFindingSelect, loadGrossFinding } from "@/lib/necropsy"
import { diffFields, writeAudit } from "@/lib/audit"

const GROSS_AUDIT_FIELDS = [
  "tissue",
  "site",
  "lesion",
  "distribution",
  "severity",
  "notes",
  "parasitesPresent",
  "parasitesCollected",
  "parasiteCount",
] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const finding = await loadGrossFinding(id)
    const animal = await loadAnimalOrg(finding.animalId)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, animal.id)

    const data = updateGrossFindingSchema.parse(await req.json().catch(() => null))
    if (data.organId) await assertOrganExists(data.organId)

    const before = await prisma.grossFinding.findUnique({
      where: { id },
      select: grossFindingSelect,
    })
    const updated = await prisma.grossFinding.update({
      where: { id },
      data: {
        // `null` desvincula o órgão; `undefined` não mexe.
        organ:
          data.organId === undefined
            ? undefined
            : data.organId === null
              ? { disconnect: true }
              : { connect: { id: data.organId } },
        tissue: data.tissue,
        site: data.site,
        lesion: data.lesion?.trim(),
        // `null` limpa o campo; `undefined` não mexe (semântica de schemas/common.ts).
        distribution: data.distribution,
        severity: data.severity,
        notes: data.notes,
        parasitesPresent: data.parasitesPresent,
        parasitesCollected: data.parasitesCollected,
        parasiteCount: data.parasiteCount,
      },
      select: grossFindingSelect,
    })
    if (before) {
      await writeAudit("GrossFinding", id, user.id, diffFields(before, updated, GROSS_AUDIT_FIELDS))
    }

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
    const finding = await loadGrossFinding(id)
    const animal = await loadAnimalOrg(finding.animalId)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, animal.id)

    await prisma.grossFinding.delete({ where: { id } })
    await writeAudit("GrossFinding", id, user.id, [
      { field: "deleted", oldValue: finding.lesion, newValue: null },
    ])

    // O sistema CONTINUA "com alteração" mesmo sem linhas: rebaixá-lo é uma afirmação da
    // patologista ("examinado e normal"), não uma consequência de esvaziar a tabela.
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
