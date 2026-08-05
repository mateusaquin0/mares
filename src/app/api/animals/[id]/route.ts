// MARES — Detalhe, edição e exclusão de um animal (Fase 3).
// Regras (docs/PERMISSOES.md §Animais):
//  - Ver/editar: qualquer membro da org (RESEARCHER+).
//  - Alterar isPublic: só admin da org.
//  - Excluir: só admin da org; bloqueado se houver amostras (409).

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole, orgRole } from "@/lib/auth"
import { assertAnimalVisible, getResearchScope } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { updateAnimalSchema } from "@/schemas/animal.schema"
import { animalData, animalDuplicateConflict, loadAnimalOrg } from "@/lib/animals"
import { diffFields, writeAudit } from "@/lib/audit"
import { ConflictError, ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

// Campos do animal auditados na timeline (escalares editáveis pelo usuário).
const ANIMAL_AUDIT_FIELDS = [
  "species",
  "controlId",
  "simbaRecordNumber",
  "taxonFamily",
  "taxonOrder",
  "sex",
  "lifeStage",
  "bodyCondition",
  "decompositionStage",
  "deathCondition",
  "necropsyDate",
  "strandingLat",
  "strandingLon",
  "strandingBeach",
  "municipality",
  "state",
  "eventDate",
  "macroscopicNotes",
  "isPublic",
] as const

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const base = await loadAnimalOrg(id)
    requireOrgRole(user, base.orgId, "RESEARCHER")
    await assertAnimalVisible(user, base.orgId, id)

    const animal = await prisma.animal.findUnique({
      where: { id },
      include: {
        research: { select: { id: true, name: true } },
        // Inclui os convites PENDENTES: quem enxerga o indivíduo acompanha o que já
        // convidou (e pode cancelar). O status distingue participação de convite em aberto.
        participations: {
          select: {
            status: true,
            research: { select: { id: true, name: true } },
            invitedBy: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { samples: true, media: true } },
      },
    })
    return NextResponse.json(animal)
  } catch (err) {
    return apiError(err)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const base = await loadAnimalOrg(id)
    requireOrgRole(user, base.orgId, "RESEARCHER")
    await assertAnimalVisible(user, base.orgId, id)

    const body = await req.json().catch(() => null)
    const data = updateAnimalSchema.parse(body)

    const isOrgAdmin = orgRole(user, base.orgId) === "ORG_ADMIN"
    if (data.isPublic !== undefined && !isOrgAdmin) {
      throw new ForbiddenError(
        "Apenas administradores alteram a visibilidade",
        ERROR_CODES.forbidden,
      )
    }

    try {
      // Estado anterior (banco) para diferença de auditoria.
      const before = await prisma.animal.findUnique({ where: { id } })
      const animal = await prisma.animal.update({
        where: { id },
        data: {
          ...animalData(data),
          isPublic: isOrgAdmin ? data.isPublic : undefined,
        },
      })
      if (before) {
        await writeAudit("Animal", id, user.id, diffFields(before, animal, ANIMAL_AUDIT_FIELDS))
      }
      return NextResponse.json({ id: animal.id, species: animal.species })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw await animalDuplicateConflict(e, {
          orgId: base.orgId,
          scope: await getResearchScope(user, base.orgId),
          controlId: data.controlId,
          simbaRecordNumber: data.simbaRecordNumber,
        })
      }
      throw e
    }
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const base = await loadAnimalOrg(id)
    requireOrgRole(user, base.orgId, "ORG_ADMIN")

    const samples = await prisma.sample.count({ where: { animalId: id } })
    if (samples > 0) {
      throw new ConflictError(
        "O animal possui amostras e não pode ser excluído",
        ERROR_CODES.animalHasSamples,
      )
    }

    await prisma.animal.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
