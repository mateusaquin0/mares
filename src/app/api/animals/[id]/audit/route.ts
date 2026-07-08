// MARES — Histórico de alterações (AuditLog) de um animal: reúne edições do próprio
// animal, criação/edição de amostras e alterações de análises numa única timeline.
// Regras (docs/PERMISSOES.md §Auditoria): ver = qualquer membro da org (no escopo visível).

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

    // Amostras visíveis do animal (contexto p/ logs de Sample e Analysis).
    const samples = await prisma.sample.findMany({
      where: scope.all ? { animalId: id } : { animalId: id, researchId: { in: scope.ids } },
      select: { id: true, identification: true },
    })
    const sampleIds = samples.map((s) => s.id)
    const sampleById = new Map(samples.map((s) => [s.id, s]))

    // Análises dessas amostras + contexto (patógeno/exame/órgão) para a linha do log.
    const analyses = await prisma.analysis.findMany({
      where: { sampleId: { in: sampleIds } },
      select: {
        id: true,
        sampleId: true,
        pathogen: { select: { scientificName: true, name: true } },
        examType: { select: { name: true } },
        sample: { select: { organ: { select: { name: true } } } },
      },
    })
    const analysisById = new Map(analyses.map((a) => [a.id, a]))
    const analysisIds = analyses.map((a) => a.id)

    // Logs das três entidades ligadas a este animal, numa só consulta.
    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entity: "Animal", entityId: id },
          { entity: "Sample", entityId: { in: sampleIds } },
          { entity: "Analysis", entityId: { in: analysisIds } },
        ],
      },
      orderBy: { changedAt: "desc" },
      take: 500,
    })
    if (logs.length === 0) return NextResponse.json([])

    // Resolve nomes dos autores em uma consulta.
    const userIds = [...new Set(logs.map((l) => l.userId))]
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    })
    const userById = new Map(users.map((u) => [u.id, u]))

    const result = logs.map((l) => {
      const author = userById.get(l.userId)
      const base = {
        id: l.id,
        entity: l.entity,
        changedAt: l.changedAt,
        field: l.field,
        oldValue: l.oldValue,
        newValue: l.newValue,
        author: author?.name ?? author?.email ?? l.userId,
        pathogen: null as unknown,
        examType: null as unknown,
        organ: null as unknown,
        sample: null as { identification: string } | null,
      }
      if (l.entity === "Analysis") {
        const ctx = analysisById.get(l.entityId)
        const s = ctx ? sampleById.get(ctx.sampleId) : undefined
        return {
          ...base,
          pathogen: ctx?.pathogen ?? null,
          examType: ctx?.examType ?? null,
          organ: ctx?.sample.organ ?? null,
          sample: s ? { identification: s.identification } : null,
        }
      }
      if (l.entity === "Sample") {
        const s = sampleById.get(l.entityId)
        return { ...base, sample: s ? { identification: s.identification } : null }
      }
      return base // Animal
    })

    return NextResponse.json(result)
  } catch (err) {
    return apiError(err)
  }
}
