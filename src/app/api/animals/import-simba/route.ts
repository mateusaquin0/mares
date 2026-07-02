// MARES — Import de animal a partir de um registro do SIMBA (Fase 3).
// Fluxo (docs/ARQUITETURA_BACKEND.md §5.5):
//  1. Busca o registro no SIMBA (parse de XML Darwin Core).
//  2. Enriquece/valida a taxonomia no WoRMS (best-effort).
//  3. Cria o animal na pesquisa informada, com source = "simba".
// Permissões: qualquer membro da org (RESEARCHER+). isPublic sempre false no import.

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAuthUser, getActiveOrgId, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { importSimbaSchema } from "@/schemas/animal.schema"
import { animalData, assertResearchInOrg } from "@/lib/animals"
import { fetchSimbaRecord } from "@/lib/simba"
import { matchWormsSpecies } from "@/lib/worms"
import { ConflictError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const orgId = await getActiveOrgId(user)
    if (!orgId) return unauthorized()
    requireOrgRole(user, orgId, "RESEARCHER")

    const body = await req.json().catch(() => null)
    const { simbaRecordNumber, researchId } = importSimbaSchema.parse(body)

    await assertResearchInOrg(researchId, orgId)

    // Evita a busca ao SIMBA se já existe animal com esse registro.
    const existing = await prisma.animal.findUnique({
      where: { simbaRecordNumber },
      select: { id: true },
    })
    if (existing) {
      throw new ConflictError("Registro do SIMBA já importado", ERROR_CODES.animalDuplicate)
    }

    // 1. SIMBA → 2. WoRMS (best-effort: não bloqueia se falhar).
    const record = await fetchSimbaRecord(simbaRecordNumber)
    const taxon = record.species ? await matchWormsSpecies(record.species) : null

    try {
      const animal = await prisma.animal.create({
        data: {
          ...animalData({
            species: taxon?.acceptedName ?? record.species ?? undefined,
            simbaRecordNumber: record.simbaRecordNumber,
            wormsAphiaId: taxon?.wormsAphiaId ?? null,
            taxonFamily: taxon?.taxonFamily ?? null,
            taxonOrder: taxon?.taxonOrder ?? null,
            sex: record.sex,
            lifeStage: record.lifeStage,
            strandingLat: record.strandingLat,
            strandingLon: record.strandingLon,
            strandingBeach: record.strandingBeach,
            municipality: record.municipality,
            state: record.state,
            eventDate: record.eventDate,
          }),
          species: taxon?.acceptedName ?? record.species ?? "",
          source: "simba",
          research: { connect: { id: researchId } },
        },
        select: { id: true, species: true },
      })
      return NextResponse.json(animal, { status: 201 })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictError("Registro do SIMBA já importado", ERROR_CODES.animalDuplicate)
      }
      throw e
    }
  } catch (err) {
    return apiError(err)
  }
}
