// MARES — Proxy do SIMBA: busca um registro por número e devolve os campos já
// mapeados (parse de XML Darwin Core feito no servidor, evitando CORS).
// Usado para pré-visualizar os dados antes de importar. Ver docs/CONTRATO_API.md §10.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, getActiveOrgId, requireOrgRole } from "@/lib/auth"
import { apiError, tooManyRequests, unauthorized } from "@/lib/api"
import { rateLimit } from "@/lib/rate-limit"
import { fetchSimbaRecord } from "@/lib/simba"
import { matchWormsSpecies } from "@/lib/worms"
import { ValidationError } from "@/lib/errors"

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const orgId = await getActiveOrgId(user)
    if (!orgId) return unauthorized()
    requireOrgRole(user, orgId, "RESEARCHER")

    // Proxy para API externa (SIMBA): limita para não abusar do serviço de terceiros.
    const limit = rateLimit(`simba:${user.id}`, { limit: 30, windowMs: 60 * 1000 })
    if (!limit.ok) return tooManyRequests(limit.retryAfter)

    const recordNumber = req.nextUrl.searchParams.get("record_number")?.trim()
    if (!recordNumber) throw new ValidationError("Informe o número de registro do SIMBA")

    // SIMBA → enriquecimento taxonômico no WoRMS (best-effort) para o pré-preenchimento.
    const record = await fetchSimbaRecord(recordNumber)
    const taxon = record.species ? await matchWormsSpecies(record.species) : null

    return NextResponse.json({
      ...record,
      species: taxon?.acceptedName ?? record.species,
      wormsAphiaId: taxon?.wormsAphiaId ?? null,
      taxonFamily: taxon?.taxonFamily ?? null,
      taxonOrder: taxon?.taxonOrder ?? null,
    })
  } catch (err) {
    return apiError(err)
  }
}
