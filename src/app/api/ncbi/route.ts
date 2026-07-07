// MARES — Proxy de busca taxonômica no NCBI Taxonomy (E-utilities).
// esearch (nomes) → efetch (linhagem) para devolver nome científico + família/ordem + TaxId.
// A chave da API vai em NCBI_API_KEY (env). Doc: https://www.ncbi.nlm.nih.gov/books/NBK25501/

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth"
import { apiError, tooManyRequests, unauthorized } from "@/lib/api"
import { clientKey, rateLimit } from "@/lib/rate-limit"

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

// Primeiro valor de uma tag simples.
function firstTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"))
  return m ? m[1].trim() : null
}

// Nome científico de um Rank dentro do LineageEx (ex.: family, order).
function lineageName(xml: string, rank: string): string | null {
  const m = xml.match(
    new RegExp(`<ScientificName>([^<]+)</ScientificName>\\s*<Rank>${rank}</Rank>`, "i")
  )
  return m ? m[1].trim() : null
}

// Divide o TaxaSet nos blocos <Taxon> de nível superior (ignora os aninhados no LineageEx).
function topLevelTaxa(xml: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = -1
  const re = /<\/?Taxon>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    if (m[0] === "<Taxon>") {
      if (depth === 0) start = m.index + m[0].length
      depth++
    } else {
      depth--
      if (depth === 0 && start >= 0) {
        out.push(xml.slice(start, m.index))
        start = -1
      }
    }
  }
  return out
}

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

    const auth = process.env.NCBI_API_KEY ? `&api_key=${process.env.NCBI_API_KEY}` : ""

    // 1) esearch: nomes que começam com o termo (truncamento *).
    const esearch = `${EUTILS}/esearch.fcgi?db=taxonomy&retmax=10&retmode=json&term=${encodeURIComponent(
      `${q}*`
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

    const results = topLevelTaxa(xml)
      .map((block) => ({
        key: Number(firstTag(block, "TaxId")),
        scientificName: firstTag(block, "ScientificName") ?? "",
        rank: firstTag(block, "Rank"),
        family: lineageName(block, "family"),
        order: lineageName(block, "order"),
      }))
      .filter((r) => r.scientificName && Number.isFinite(r.key) && r.key > 0)

    return NextResponse.json(results)
  } catch (err) {
    return apiError(err)
  }
}
