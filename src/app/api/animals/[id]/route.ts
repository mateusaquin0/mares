// MARES — Detalhe, edição e exclusão de um animal (Fase 3).
// Regras (docs/PERMISSOES.md §Animais):
//  - Ver/editar: qualquer membro da org (RESEARCHER+).
//  - Alterar isPublic: só admin da org.
//  - Excluir: só admin da org; bloqueado se houver amostras (409).

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole, orgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { updateAnimalSchema } from "@/schemas/animal.schema"
import { animalData, animalDuplicateError, loadAnimalOrg } from "@/lib/animals"
import { ConflictError, ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const base = await loadAnimalOrg(id)
    requireOrgRole(user, base.orgId, "RESEARCHER")

    const animal = await prisma.animal.findUnique({
      where: { id },
      include: {
        research: { select: { id: true, name: true } },
        participations: {
          select: { research: { select: { id: true, name: true } } },
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
      const animal = await prisma.animal.update({
        where: { id },
        data: {
          ...animalData(data),
          isPublic: isOrgAdmin ? data.isPublic : undefined,
        },
        select: { id: true, species: true },
      })
      return NextResponse.json(animal)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw animalDuplicateError(e)
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
