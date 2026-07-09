// MARES — Grade de resultados de UMA pesquisa, agregando TODOS os animais dela.
// Espelha /api/animals/[id]/grid, mas escopado por pesquisa: o protocolo (único) da pesquisa
// aplicado às amostras de cada animal, com as análises já preenchidas numa lista plana.
// Ver: qualquer membro que enxergue a pesquisa (docs/PERMISSOES.md §Escopo por pesquisa).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertResearchVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params

    const research = await prisma.research.findUnique({
      where: { id },
      select: { id: true, name: true, orgId: true },
    })
    if (!research) throw new NotFoundError("Pesquisa não encontrada", ERROR_CODES.researchNotFound)
    requireOrgRole(user, research.orgId, "RESEARCHER")
    await assertResearchVisible(user, research.orgId, id)

    const [protocol, samples, analyses] = await Promise.all([
      prisma.researchProtocol.findMany({
        where: { researchId: id },
        orderBy: { id: "asc" },
        select: {
          organId: true,
          pathogenId: true,
          examTypeId: true,
          status: true,
          pathogen: { select: { id: true, scientificName: true, name: true } },
          examType: { select: { id: true, name: true, measureLabel: true, measureUnit: true } },
        },
      }),
      prisma.sample.findMany({
        where: { researchId: id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          sampleType: true,
          status: true,
          animalId: true,
          organ: { select: { id: true, name: true } },
          animal: {
            select: {
              id: true,
              controlId: true,
              simbaRecordNumber: true,
              species: true,
              sex: true,
              lifeStage: true,
              municipality: true,
              state: true,
              strandingBeach: true,
              eventDate: true,
            },
          },
        },
      }),
      prisma.analysis.findMany({
        where: { sample: { researchId: id } },
        select: {
          sampleId: true,
          pathogenId: true,
          examTypeId: true,
          result: true,
          measureValue: true,
          notes: true,
        },
      }),
    ])

    // Agrupa amostras por animal, preservando a ordem de primeira aparição.
    type SampleRow = (typeof samples)[number]
    const order: string[] = []
    const byAnimal = new Map<string, { animal: SampleRow["animal"]; samples: SampleRow[] }>()
    for (const s of samples) {
      let bucket = byAnimal.get(s.animalId)
      if (!bucket) {
        bucket = { animal: s.animal, samples: [] }
        byAnimal.set(s.animalId, bucket)
        order.push(s.animalId)
      }
      bucket.samples.push(s)
    }

    const animals = order.map((aid) => {
      const bucket = byAnimal.get(aid)!
      return {
        ...bucket.animal,
        samples: bucket.samples.map((s) => ({
          id: s.id,
          sampleType: s.sampleType,
          status: s.status,
          organ: s.organ,
        })),
      }
    })

    return NextResponse.json({
      research: { id: research.id, name: research.name },
      protocol,
      animals,
      analyses,
    })
  } catch (err) {
    return apiError(err)
  }
}
