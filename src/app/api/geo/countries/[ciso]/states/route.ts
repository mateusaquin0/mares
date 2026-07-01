// MARES — Proxy autenticado para os estados de um país (CountryStateCity).
// Mantém a CSC_API_KEY no servidor e adiciona cache (memória + Next + HTTP).

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { getStates } from "@/lib/csc"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ciso: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { ciso } = await params
    const states = await getStates(ciso)

    return NextResponse.json(states, {
      headers: { "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800" },
    })
  } catch (err) {
    return apiError(err)
  }
}
