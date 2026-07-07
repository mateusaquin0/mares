// MARES — Proxy de busca taxonômica no WoRMS (World Register of Marine Species).
// API pública REST (sem chave). Usada no autocomplete de espécie do cadastro de animais.
// Doc: https://www.marinespecies.org/rest/

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth"
import { apiError, tooManyRequests, unauthorized } from "@/lib/api"
import { clientKey, rateLimit } from "@/lib/rate-limit"

type AphiaRecord = {
  AphiaID: number
  scientificname: string
  rank: string | null
  status: string | null
  family: string | null
  order: string | null
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    // Proxy para API externa (WoRMS): limita para não abusar do serviço de terceiros.
    const limit = rateLimit(clientKey(req, "worms"), { limit: 30, windowMs: 60 * 1000 })
    if (!limit.ok) return tooManyRequests(limit.retryAfter)

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
    if (q.length < 3) return NextResponse.json([])

    const url = `https://www.marinespecies.org/rest/AphiaRecordsByName/${encodeURIComponent(
      q
    )}?like=true&marine_only=false&offset=1`

    const res = await fetch(url, { headers: { Accept: "application/json" } })
    // 204 = sem resultados.
    if (res.status === 204) return NextResponse.json([])
    if (!res.ok) return NextResponse.json([])

    const records = (await res.json()) as AphiaRecord[] | null
    if (!Array.isArray(records)) return NextResponse.json([])

    // Prioriza nomes aceitos; limita a 10.
    const mapped = records
      .map((r) => ({
        aphiaId: r.AphiaID,
        scientificName: r.scientificname,
        rank: r.rank,
        status: r.status,
        family: r.family,
        order: r.order,
      }))
      .sort((a, b) => Number(b.status === "accepted") - Number(a.status === "accepted"))
      .slice(0, 10)

    return NextResponse.json(mapped)
  } catch (err) {
    return apiError(err)
  }
}
