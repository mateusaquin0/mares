// MARES — Solicitações de glossário do próprio usuário (status + motivo da rejeição).

import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { listMyRequests } from "@/lib/catalog-requests"

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const rows = await listMyRequests(user.id)
    return NextResponse.json(rows)
  } catch (err) {
    return apiError(err)
  }
}
