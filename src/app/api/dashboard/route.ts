// MARES — Dados agregados do Dashboard (Fase 5).
// Escopo: organização ativa do usuário; filtros globais opcionais (pesquisa, período).

import { NextRequest, NextResponse } from "next/server"
import { getLocale } from "next-intl/server"
import { getAuthUser, getActiveOrgId, requireOrgRole } from "@/lib/auth"
import { getResearchScope } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { getDashboardData, type DashboardData } from "@/lib/dashboard"

const EMPTY: DashboardData = {
  totals: { animals: 0, samples: 0, analyses: 0, positive: 0, positivity: 0 },
  species: [],
  positivityByExam: [],
  timeline: [],
  heat: [],
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const orgId = await getActiveOrgId(user)
    // Admin global sem organização ativa: dashboard vazio (nada a agregar).
    if (!orgId) return NextResponse.json(EMPTY)
    requireOrgRole(user, orgId, "RESEARCHER")

    const sp = req.nextUrl.searchParams
    const researchId = sp.get("researchId") ?? undefined

    // Escopo por pesquisa: pesquisador só agrega as pesquisas visíveis. Se filtrar por uma
    // pesquisa fora do escopo, retorna vazio.
    const scope = await getResearchScope(user, orgId)
    if (!scope.all) {
      if (scope.ids.length === 0) return NextResponse.json(EMPTY)
      if (researchId && !scope.ids.includes(researchId)) return NextResponse.json(EMPTY)
    }

    const locale = await getLocale()
    const data = await getDashboardData(orgId, locale, {
      researchId,
      researchIds: scope.all ? undefined : scope.ids,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
    })
    return NextResponse.json(data)
  } catch (err) {
    return apiError(err)
  }
}
