// MARES — Proxy autenticado para as cidades de um estado (CountryStateCity).
// Mantém a CSC_API_KEY no servidor e adiciona cache (memória + Next + HTTP).

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { getCities } from "@/lib/csc"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ciso: string; siso: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { ciso, siso } = await params
    const cities = await getCities(ciso, siso)

    return NextResponse.json(cities, {
      headers: { "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800" },
    })
  } catch (err) {
    return apiError(err)
  }
}
