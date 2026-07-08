// MARES — Histórico de alterações (AuditLog) das análises de um animal (Fase 3).
// Regras (docs/PERMISSOES.md §Auditoria): ver = qualquer membro da org.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertAnimalVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg } from "@/lib/animals"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    const scope = await assertAnimalVisible(user, animal.orgId, id)

    // Análises deste animal + contexto (patógeno/exame/órgão) para exibir na linha do log.
    const analyses = await prisma.analysis.findMany({
      where: {
        sample: scope.all ? { animalId: id } : { animalId: id, researchId: { in: scope.ids } },
      },
      select: {
        id: true,
        pathogen: { select: { scientificName: true, name: true } },
        examType: { select: { name: true } },
        sample: { select: { organ: { select: { name: true } } } },
      },
    })
    const contextById = new Map(analyses.map((a) => [a.id, a]))
    const analysisIds = analyses.map((a) => a.id)
    if (analysisIds.length === 0) return NextResponse.json([])

    const logs = await prisma.auditLog.findMany({
      where: { entity: "Analysis", entityId: { in: analysisIds } },
      orderBy: { changedAt: "desc" },
      take: 500,
    })

    // Resolve nomes dos autores em uma consulta.
    const userIds = [...new Set(logs.map((l) => l.userId))]
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    })
    const userById = new Map(users.map((u) => [u.id, u]))

    const result = logs.map((l) => {
      const ctx = contextById.get(l.entityId)
      const author = userById.get(l.userId)
      return {
        id: l.id,
        changedAt: l.changedAt,
        field: l.field,
        oldValue: l.oldValue,
        newValue: l.newValue,
        author: author?.name ?? author?.email ?? l.userId,
        pathogen: ctx?.pathogen ?? null,
        examType: ctx?.examType ?? null,
        organ: ctx?.sample.organ ?? null,
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    return apiError(err)
  }
}
