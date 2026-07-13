// MARES — Contagens de pendências para o indicador (bolinha) do menu lateral.
// Cada contagem só é calculada se o usuário tiver a permissão correspondente; caso
// contrário retorna 0 (o cliente nunca vê pendência que não poderia tratar).
//   - accessRequests   → admin global (JoinRequest PENDING)
//   - feedback         → admin global (Feedback NEW)
//   - glossaryRequests → curador de glossário (CatalogRequest PENDING)

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, canReviewCatalogRequest } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { countPendingRequests } from "@/lib/catalog-requests"

export type PendingCounts = {
  accessRequests: number
  feedback: number
  glossaryRequests: number
}

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const isAdmin = user.isSystemAdmin
    const isReviewer = canReviewCatalogRequest(user)

    const [accessRequests, feedback, glossaryRequests] = await Promise.all([
      isAdmin ? prisma.joinRequest.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
      isAdmin ? prisma.feedback.count({ where: { status: "NEW" } }) : Promise.resolve(0),
      isReviewer ? countPendingRequests() : Promise.resolve(0),
    ])

    const counts: PendingCounts = { accessRequests, feedback, glossaryRequests }
    return NextResponse.json(counts)
  } catch (err) {
    return apiError(err)
  }
}
