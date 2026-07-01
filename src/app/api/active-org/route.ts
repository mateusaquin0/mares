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
