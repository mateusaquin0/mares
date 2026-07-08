// MARES — Remove a participação de uma pesquisa em um indivíduo (Etapa 1).
// Não afeta a pesquisa primária (Animal.researchId), apenas as participações adicionais.
// Autorização: membro da org (RESEARCHER+).

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg, removeAnimalResearch } from "@/lib/animals"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; researchId: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id, researchId } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")

    await removeAnimalResearch(id, researchId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
