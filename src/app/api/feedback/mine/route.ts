// MARES — Feedback do próprio usuário (acompanhar status e a resposta da administração).
// Só autenticação: o recorte é por autor e sem a anotação interna do admin (ver mineSelect).

import { NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { listMyFeedback } from "@/lib/feedback"

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const rows = await listMyFeedback(user.id)
    return NextResponse.json(rows)
  } catch (err) {
    return apiError(err)
  }
}
