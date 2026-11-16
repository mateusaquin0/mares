// MARES — Proxy autenticado para as cidades de um estado (CountryStateCity).
// Mantém a CSC_API_KEY no servidor e adiciona cache (memória + Next + HTTP).

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth"
import { apiError, tooManyRequests, unauthorized } from "@/lib/api"
import { rateLimit } from "@/lib/rate-limit"
import { getCities } from "@/lib/csc"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ciso: string; siso: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    // Proxy para API externa (CountryStateCity): limita para não abusar do serviço de terceiros.
    const limit = rateLimit(`geo:${user.id}`, { limit: 60, windowMs: 60 * 1000 })
    if (!limit.ok) return tooManyRequests(limit.retryAfter)

    const { ciso, siso } = await params
    const cities = await getCities(ciso, siso)

    return NextResponse.json(cities, {
      headers: { "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800" },
    })
  } catch (err) {
    return apiError(err)
  }
}
