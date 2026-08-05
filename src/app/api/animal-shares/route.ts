// MARES — Caixa de entrada dos compartilhamentos de indivíduo pendentes.
//
// Lista o que o usuário PODE responder, nos dois sentidos (ver docs/PERMISSOES.md):
//   • convites recebidos  — outra pesquisa ofereceu um indivíduo a uma pesquisa dele;
//   • pedidos recebidos   — alguém quer um indivíduo cuja pesquisa primária é dele.
//
// O escopo por pesquisa é o mesmo do resto do sistema: admin da org responde por todas.

import { NextResponse } from "next/server"
import { getAuthUser, getActiveOrgId, requireOrgRole } from "@/lib/auth"
import { getResearchScope } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { listPendingShares } from "@/lib/animals"

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const orgId = await getActiveOrgId(user)
    if (!orgId) return NextResponse.json([])
    requireOrgRole(user, orgId, "RESEARCHER")

    const scope = await getResearchScope(user, orgId)
    return NextResponse.json(await listPendingShares(orgId, scope.all ? undefined : scope.ids))
  } catch (err) {
    return apiError(err)
  }
}
