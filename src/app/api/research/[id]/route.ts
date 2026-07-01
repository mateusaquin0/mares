// MARES — Detalhe, edição e exclusão de uma pesquisa.
// Regras (docs/PERMISSOES.md §Pesquisas):
//  - Ver: qualquer membro da org.
//  - Editar nome/descrição: admin da org, ou o pesquisador que a criou.
//  - Alterar isPublic: só admin da org.
//  - Excluir: só admin da org; bloqueado se houver animais (409).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole, orgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { updateResearchSchema } from "@/schemas/research.schema"
import { NotFoundError, ForbiddenError, ConflictError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

async function loadResearch(id: string) {
  const research = await prisma.research.findUnique({
    where: { id },
    select: { id: true, orgId: true, createdById: true },
  })
  if (!research) throw new NotFoundError("Pesquisa não encontrada", ERROR_CODES.researchNotFound)
  return research
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const base = await loadResearch(id)
    requireOrgRole(user, base.orgId, "RESEARCHER")

    const research = await prisma.research.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        orgId: true,
        createdById: true,
        createdAt: true,
        _count: { select: { animals: true } },
        protocols: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            organ: { select: { id: true, name: true } },
            pathogen: { select: { id: true, scientificName: true, name: true } },
            examType: { select: { id: true, name: true } },
          },
        },
      },
    })

    return NextResponse.json(research)
  } catch (err) {
    return apiError(err)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const research = await loadResearch(id)
    requireOrgRole(user, research.orgId, "RESEARCHER")

    const body = await req.json().catch(() => null)
    const data = updateResearchSchema.parse(body)

    const isOrgAdmin = orgRole(user, research.orgId) === "ORG_ADMIN"

    // Só admin altera visibilidade.
    if (data.isPublic !== undefined && !isOrgAdmin) {
      throw new ForbiddenError("Apenas administradores alteram a visibilidade", ERROR_CODES.forbidden)
    }
    // Pesquisador só edita nome/descrição da própria pesquisa.
    const editsContent = data.name !== undefined || data.description !== undefined
    if (editsContent && !isOrgAdmin && research.createdById !== user.id) {
      throw new ForbiddenError("Você só pode editar a pesquisa que criou", ERROR_CODES.forbidden)
    }

    const updated = await prisma.research.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        description:
          data.description === undefined ? undefined : data.description.trim() || null,
        isPublic: isOrgAdmin ? data.isPublic : undefined,
      },
      select: { id: true, name: true, description: true, isPublic: true },
    })

    return NextResponse.json(updated)
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const research = await loadResearch(id)
    requireOrgRole(user, research.orgId, "ORG_ADMIN")

    const animals = await prisma.animal.count({ where: { researchId: id } })
    if (animals > 0) {
      throw new ConflictError(
        "A pesquisa possui animais e não pode ser excluída",
        ERROR_CODES.researchHasAnimals
      )
    }

    await prisma.research.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
