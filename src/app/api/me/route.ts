// MARES — Usuário autenticado + organizações (para o seletor de org ativa).

import { NextResponse } from "next/server"
import { getAuthUser, getActiveOrgId } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const activeOrgId = await getActiveOrgId(user)

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      isSystemAdmin: user.isSystemAdmin,
      memberships: user.memberships,
      activeOrgId,
    })
  } catch (err) {
    return apiError(err)
  }
}
