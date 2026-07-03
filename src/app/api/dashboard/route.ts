// MARES — Dados agregados do Dashboard (Fase 5).
// Escopo: organização ativa do usuário; filtros globais opcionais (pesquisa, período).

import { NextRequest, NextResponse } from "next/server"
import { getLocale } from "next-intl/server"
import { getAuthUser, getActiveOrgId, requireOrgRole } from "@/lib/auth"
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
    const locale = await getLocale()
    const data = await getDashboardData(orgId, locale, {
      researchId: sp.get("researchId") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
    })
    return NextResponse.json(data)
  } catch (err) {
    return apiError(err)
  }
}
