// MARES — Amostras de um animal: listar e criar (Fase 3).
// Regras (docs/PERMISSOES.md §Amostras): ver/criar/editar = qualquer membro da org.

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { createSampleSchema } from "@/schemas/sample.schema"
import { assertResearchOnAnimal, loadAnimalOrg } from "@/lib/animals"
import { assertOrgan, sampleData, sampleDuplicateError, sampleSelect } from "@/lib/samples"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")

    const samples = await prisma.sample.findMany({
      where: { animalId: id },
      orderBy: { createdAt: "asc" },
      select: sampleSelect,
    })
    return NextResponse.json(samples)
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")

    const body = await req.json().catch(() => null)
    const data = createSampleSchema.parse(body)
    await assertOrgan(data.organId)
    // A pesquisa dona da amostra tem de ser uma das pesquisas do indivíduo (primária/participante).
    await assertResearchOnAnimal(id, data.researchId)

    try {
      const sample = await prisma.sample.create({
        data: {
          ...sampleData(data),
          identification: data.identification.trim(),
          sampleType: data.sampleType.trim(),
          orgId: animal.orgId, // denormalizado p/ unicidade por organização
          animal: { connect: { id } },
          research: { connect: { id: data.researchId } },
          organ: { connect: { id: data.organId } },
        },
        select: sampleSelect,
      })
      return NextResponse.json(sample, { status: 201 })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw sampleDuplicateError()
      }
      throw e
    }
  } catch (err) {
    return apiError(err)
  }
}
