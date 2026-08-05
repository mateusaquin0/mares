// MARES — Resposta a um compartilhamento de indivíduo (ver ../route.ts para a criação).
//
//   PATCH  → ACEITA. Só o lado que ainda não consentiu decide: a pesquisa CONVIDADA quando
//            a origem é INVITE; a pesquisa PRIMÁRIA do indivíduo quando é REQUEST.
//   DELETE → RECUSA (pelo mesmo lado que decidiria), CANCELAMENTO (por quem iniciou) ou
//            DESVINCULAÇÃO de uma participação já aceita. Bloqueado se a pesquisa já tiver
//            amostras no indivíduo (elas ficariam sem dona) — ver removeAnimalResearch.
//
// Nunca afeta a pesquisa primária (Animal.researchId), apenas as participações adicionais.
// Autorização: membro da org (RESEARCHER+). Ver docs/PERMISSOES.md.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { getResearchScope } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { acceptAnimalShare, loadAnimalShare, removeAnimalResearch } from "@/lib/animals"
import { ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

type Ctx = { params: Promise<{ id: string; researchId: string }> }

export async function PATCH(_req: NextRequest, { params }: Ctx) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id, researchId } = await params
    const share = await loadAnimalShare(id, researchId)
    requireOrgRole(user, share.orgId, "RESEARCHER")

    const scope = await getResearchScope(user, share.orgId)
    // Quem aceita é o lado que ainda não consentiu — jamais quem iniciou.
    if (!scope.all && !scope.ids.includes(share.deciderResearchId)) {
      throw new ForbiddenError(
        "Apenas a outra pesquisa pode responder a este compartilhamento",
        ERROR_CODES.animalShareCannotDecide,
      )
    }

    await acceptAnimalShare(id, researchId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id, researchId } = await params
    const share = await loadAnimalShare(id, researchId)
    requireOrgRole(user, share.orgId, "RESEARCHER")

    // Os dois lados podem desfazer: um recusa/desvincula, o outro cancela o que pediu.
    const scope = await getResearchScope(user, share.orgId)
    const involved =
      scope.all ||
      scope.ids.includes(share.deciderResearchId) ||
      scope.ids.includes(share.requesterResearchId)
    if (!involved) throw new ForbiddenError()

    await removeAnimalResearch(id, researchId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
