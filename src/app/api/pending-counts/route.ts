// MARES — Contagens de pendências para o indicador (bolinha) do menu lateral.
// Cada contagem só é calculada se o usuário tiver a permissão correspondente; caso
// contrário retorna 0 (o cliente nunca vê pendência que não poderia tratar).
//   - accessRequests   → admin global (JoinRequest PENDING)
//   - feedback         → admin global (Feedback NEW)
//   - glossaryRequests → curador de glossário (CatalogRequest PENDING)

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, getActiveOrgId, orgRole, canReviewCatalogRequest } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { countPendingRequests } from "@/lib/catalog-requests"
import { countReviewableAccessRequests } from "@/lib/research-requests"
import { countPendingShares } from "@/lib/animals"
import { getResearchScope } from "@/lib/research-access"

export type PendingCounts = {
  accessRequests: number
  feedback: number
  glossaryRequests: number
  // Pendências do grupo (pesquisador comum também vê): pedidos de acesso às pesquisas que
  // ele gere e compartilhamentos de indivíduo aguardando a resposta dele.
  researchAccess: number
  animalShares: number
}

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const isAdmin = user.isSystemAdmin
    const isReviewer = canReviewCatalogRequest(user)
    // Contagens do grupo dependem da organização ativa; sem ela, ficam zeradas.
    const orgId = await getActiveOrgId(user)
    const isOrgMember = !!orgId && !!orgRole(user, orgId)

    const [accessRequests, feedback, glossaryRequests, researchAccess, animalShares] =
      await Promise.all([
        isAdmin ? prisma.joinRequest.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
        isAdmin ? prisma.feedback.count({ where: { status: "NEW" } }) : Promise.resolve(0),
        isReviewer ? countPendingRequests() : Promise.resolve(0),
        isOrgMember
          ? countReviewableAccessRequests(orgId, user.id, orgRole(user, orgId) === "ORG_ADMIN")
          : Promise.resolve(0),
        isOrgMember
          ? getResearchScope(user, orgId).then((scope) =>
              countPendingShares(orgId, scope.all ? undefined : scope.ids),
            )
          : Promise.resolve(0),
      ])

    const counts: PendingCounts = {
      accessRequests,
      feedback,
      glossaryRequests,
      researchAccess,
      animalShares,
    }
    return NextResponse.json(counts)
  } catch (err) {
    return apiError(err)
  }
}
