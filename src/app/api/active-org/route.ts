// MARES — Define a organização ativa (cookie), validada contra os vínculos do usuário.

import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getAuthUser, ACTIVE_ORG_COOKIE } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { setActiveOrgSchema } from "@/schemas/organization.schema"
import { ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const body = await req.json().catch(() => null)
    const { orgId } = setActiveOrgSchema.parse(body)

    if (!user.memberships.some((m) => m.orgId === orgId)) {
      throw new ForbiddenError("Você não pertence a esta organização", ERROR_CODES.notMember)
    }

    const cookieStore = await cookies()
    cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    })

    return NextResponse.json({ activeOrgId: orgId })
  } catch (err) {
    return apiError(err)
  }
}

// Apaga o cookie de organização ativa — usado no logout.
//
// O cookie é httpOnly com validade de um ano, então o cliente não consegue removê-lo
// sozinho e ele sobreviveria à troca de conta. Não há risco de vazamento (getActiveOrgId
// valida o id contra os vínculos de quem está logado), mas quem entrasse depois e também
// pertencesse àquele grupo cairia nele em vez de no seu próprio padrão.
//
// Não exige sessão de propósito: apagar um cookie do próprio navegador não é operação
// privilegiada, e assim continua funcionando se chamado depois do signOut.
export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete(ACTIVE_ORG_COOKIE)
  return new NextResponse(null, { status: 204 })
}
