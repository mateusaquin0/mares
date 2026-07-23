// MARES — Proxy de busca taxonômica no NCBI Taxonomy (E-utilities).
// esearch (nomes) → efetch (linhagem) para devolver nome científico + família/ordem + TaxId.
// A chave da API vai em NCBI_API_KEY (env). Doc: https://www.ncbi.nlm.nih.gov/books/NBK25501/

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth"
import { apiError, tooManyRequests, unauthorized } from "@/lib/api"
import { clientKey, rateLimit } from "@/lib/rate-limit"
import { parseNcbiTaxa } from "@/lib/ncbi"
import { env } from "@/env"

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    // Proxy para API externa (NCBI E-utilities): a política sem chave é de ~3 req/s.
    // Limita por IP para respeitar a cota compartilhada do serviço.
    const limit = rateLimit(clientKey(req, "ncbi"), { limit: 20, windowMs: 60 * 1000 })
    if (!limit.ok) return tooManyRequests(limit.retryAfter)

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
    if (q.length < 3) return NextResponse.json([])

    const auth = env.NCBI_API_KEY ? `&api_key=${env.NCBI_API_KEY}` : ""

    // 1) esearch: nomes que começam com o termo (truncamento *).
    const esearch = `${EUTILS}/esearch.fcgi?db=taxonomy&retmax=10&retmode=json&term=${encodeURIComponent(
      `${q}*`,
    )}${auth}`
    const sres = await fetch(esearch, { headers: { Accept: "application/json" } })
    if (!sres.ok) return NextResponse.json([])
    const sjson = (await sres.json()) as { esearchresult?: { idlist?: string[] } }
    const ids = sjson.esearchresult?.idlist ?? []
    if (ids.length === 0) return NextResponse.json([])

    // 2) efetch: linhagem (família/ordem) dos taxa encontrados.
    const efetch = `${EUTILS}/efetch.fcgi?db=taxonomy&id=${ids.join(",")}&retmode=xml${auth}`
    const fres = await fetch(efetch, { headers: { Accept: "application/xml" } })
    if (!fres.ok) return NextResponse.json([])
    const xml = await fres.text()

    return NextResponse.json(parseNcbiTaxa(xml))
  } catch (err) {
    return apiError(err)
  }
}
