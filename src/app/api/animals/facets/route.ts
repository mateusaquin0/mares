// MARES — Facetas dos filtros da listagem de animais (paginação server-side).
// Retorna os valores distintos de TODO o conjunto no escopo do usuário (independente dos
// filtros aplicados), para alimentar os multiselects. Ver docs/CONTRATO_API.md §1.

import { NextResponse } from "next/server"
import { getLocale } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, getActiveOrgId, requireOrgRole } from "@/lib/auth"
import { getResearchScope } from "@/lib/research-access"
import { animalScopeWhere } from "@/lib/animal-query"
import { pathogenName, type I18nText } from "@/lib/catalog-i18n"
import { apiError, unauthorized } from "@/lib/api"

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const orgId = await getActiveOrgId(user)
    if (!orgId) {
      return NextResponse.json({ species: [], states: [], researches: [], pathogens: [] })
    }
    requireOrgRole(user, orgId, "RESEARCHER")

    const scope = await getResearchScope(user, orgId)
    const scopeIds = scope.all ? undefined : scope.ids
    if (scopeIds && scopeIds.length === 0) {
      return NextResponse.json({ species: [], states: [], researches: [], pathogens: [] })
    }

    const where = animalScopeWhere(orgId, scopeIds)
    const locale = await getLocale()

    const [speciesRows, stateRows, researches, pathogenRows] = await Promise.all([
      prisma.animal.findMany({ where, distinct: ["species"], select: { species: true } }),
      prisma.animal.findMany({ where, distinct: ["state"], select: { state: true } }),
      prisma.research.findMany({
        where: { orgId, ...(scopeIds ? { id: { in: scopeIds } } : {}) },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      // Patógenos com pelo menos uma análise POSITIVA num animal do escopo.
      prisma.analysis.findMany({
        where: { result: "POSITIVO", sample: { animal: where } },
        distinct: ["pathogenId"],
        select: { pathogen: { select: { id: true, scientificName: true, name: true } } },
      }),
    ])

    const species = [
      ...new Set(speciesRows.map((r) => r.species).filter((s): s is string => !!s)),
    ].sort((a, b) => a.localeCompare(b, locale))
    const states = [...new Set(stateRows.map((r) => r.state).filter((s): s is string => !!s))].sort(
      (a, b) => a.localeCompare(b, locale),
    )
    const pathogens = pathogenRows
      .map((r) => ({
        id: r.pathogen.id,
        label: pathogenName(locale, {
          scientificName: r.pathogen.scientificName,
          name: r.pathogen.name as I18nText | null,
        }),
      }))
      .filter((p) => !!p.label)
      .sort((a, b) => a.label.localeCompare(b.label, locale))

    return NextResponse.json({ species, states, researches, pathogens })
  } catch (err) {
    return apiError(err)
  }
}
