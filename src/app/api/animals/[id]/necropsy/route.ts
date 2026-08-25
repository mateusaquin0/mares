// MARES — Laudo anatomopatológico de um animal: leitura completa (macro por sistema +
// histopatológico). Regras (docs/PERMISSOES.md §Animais): ver/editar = qualquer membro da
// org que enxerga o indivíduo. O laudo é do INDIVÍDUO, então não há filtro por pesquisa.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertAnimalVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg } from "@/lib/animals"
import { histopathologySelect, systemExamSelect } from "@/lib/necropsy"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    await assertAnimalVisible(user, animal.orgId, id)

    const [systems, histopathology] = await Promise.all([
      prisma.necropsySystemExam.findMany({
        where: { animalId: id },
        orderBy: { position: "asc" },
        select: systemExamSelect,
      }),
      prisma.histopathologyFinding.findMany({
        where: { animalId: id },
        orderBy: { position: "asc" },
        select: histopathologySelect,
      }),
    ])

    // A ordem é a do LAUDO (`position`), não a do catálogo: os catálogos ordenam por `key`
    // (alfabético), o que embaralharia a sequência anatômica que a necrópsia percorreu.
    return NextResponse.json({ systems, histopathology })
  } catch (err) {
    return apiError(err)
  }
}
