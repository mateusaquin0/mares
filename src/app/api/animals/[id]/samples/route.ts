// MARES — Amostras de um animal: listar e criar (Fase 3).
// Regras (docs/PERMISSOES.md §Amostras): ver/criar/editar = qualquer membro da org.

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertAnimalVisible, assertResearchVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { createSampleSchema } from "@/schemas/sample.schema"
import { assertResearchOnAnimal, loadAnimalOrg } from "@/lib/animals"
import { assertOrgan, sampleData, sampleDuplicateError, sampleSelect } from "@/lib/samples"
import { writeAudit } from "@/lib/audit"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")
    const scope = await assertAnimalVisible(user, animal.orgId, id)

    const samples = await prisma.sample.findMany({
      where: scope.all ? { animalId: id } : { animalId: id, researchId: { in: scope.ids } },
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
    await assertAnimalVisible(user, animal.orgId, id)

    const body = await req.json().catch(() => null)
    const data = createSampleSchema.parse(body)
    await assertOrgan(data.organId)
    // A pesquisa dona da amostra tem de ser uma das pesquisas do indivíduo (primária/participante).
    await assertResearchOnAnimal(id, data.researchId)
    // ...e o pesquisador só coleta amostra em pesquisa que enxerga.
    await assertResearchVisible(user, animal.orgId, data.researchId)

    try {
      const sample = await prisma.sample.create({
        data: {
          ...sampleData(data),
          identification: data.identification.trim(),
          sampleType: data.sampleType.trim(),
          orgId: animal.orgId, // denormalizado p/ unicidade por organização
          createdBy: { connect: { id: user.id } },
          animal: { connect: { id } },
          research: { connect: { id: data.researchId } },
          organ: { connect: { id: data.organId } },
        },
        select: sampleSelect,
      })
      // Evento de criação na timeline do animal (identificação como rótulo).
      await writeAudit("Sample", sample.id, user.id, [
        { field: "created", oldValue: null, newValue: sample.identification },
      ])
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
