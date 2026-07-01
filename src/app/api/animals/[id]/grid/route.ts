// MARES — Dados da grade de análises de um animal (Fase 3).
// Retorna o protocolo da pesquisa + as amostras do animal + as análises já preenchidas.
// O cliente monta, por amostra (que tem um órgão), as linhas patógeno × exame do protocolo
// cujo órgão corresponde ao da amostra, e busca o resultado existente por (sample, pathogen, exam).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg } from "@/lib/animals"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")

    const [protocol, samples, analyses] = await Promise.all([
      prisma.researchProtocol.findMany({
        where: { researchId: animal.researchId },
        select: {
          organId: true,
          pathogenId: true,
          examTypeId: true,
          pathogen: { select: { id: true, scientificName: true, name: true } },
          examType: { select: { id: true, name: true } },
        },
      }),
      prisma.sample.findMany({
        where: { animalId: id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          sampleType: true,
          status: true,
          organ: { select: { id: true, name: true } },
        },
      }),
      prisma.analysis.findMany({
        where: { sample: { animalId: id } },
        select: {
          sampleId: true,
          pathogenId: true,
          examTypeId: true,
          result: true,
          ctValue: true,
          notes: true,
        },
      }),
    ])

    return NextResponse.json({ protocol, samples, analyses })
  } catch (err) {
    return apiError(err)
  }
}
