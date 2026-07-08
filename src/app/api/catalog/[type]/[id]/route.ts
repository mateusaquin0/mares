// MARES — Editar / remover uma entrada de catálogo global.
// Permissão: admin global sempre; senão, o CRIADOR do item enquanto ele não estiver
// em uso (protocolos / amostras / análises). A remoção é sempre bloqueada (409) se em uso.

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { getAuthUser } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { isCatalogType, nameI18nSchema, examTypeSchema } from "@/schemas/catalog.schema"
import {
  updateNamed,
  updatePathogenEntry,
  resolvePathogen,
  resolveMeasure,
  deleteCatalog,
  catalogUsage,
  catalogCreatedBy,
  canModifyCatalog,
} from "@/lib/catalog"
import { NotFoundError, ConflictError, ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import type { CatalogType } from "@/schemas/catalog.schema"

// Carrega o item e valida a permissão de modificação (edição/exclusão) do usuário.
async function assertCanModify(
  user: { id: string; isSystemAdmin: boolean },
  type: CatalogType,
  id: string,
): Promise<number> {
  const row = await catalogCreatedBy(type, id)
  if (!row) throw new NotFoundError("Entrada não encontrada", ERROR_CODES.catalogNotFound)
  const usage = await catalogUsage(type, id)
  if (
    !canModifyCatalog({
      isSystemAdmin: user.isSystemAdmin,
      createdById: row.createdById,
      userId: user.id,
      usage,
    })
  ) {
    throw new ForbiddenError("Sem permissão para alterar este item", ERROR_CODES.forbidden)
  }
  return usage
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { type, id } = await params
    if (!isCatalogType(type))
      throw new NotFoundError("Catálogo inválido", ERROR_CODES.catalogNotFound)
    await assertCanModify(user, type, id)

    const body = await req.json().catch(() => null)

    try {
      if (type === "pathogens") {
        const p = await resolvePathogen(body)
        const updated = await updatePathogenEntry(id, {
          groupId: p.groupId,
          scientificName: p.scientificName,
          name: p.name,
          taxon: p.taxon,
        })
        return NextResponse.json(updated)
      }

      if (type === "exam-types") {
        const data = examTypeSchema.parse(body)
        const updated = await updateNamed(
          type,
          id,
          { pt: data.namePt.trim(), en: data.nameEn.trim() },
          resolveMeasure(data),
        )
        return NextResponse.json(updated)
      }

      const data = nameI18nSchema.parse(body)
      const updated = await updateNamed(type, id, {
        pt: data.namePt.trim(),
        en: data.nameEn.trim(),
      })
      return NextResponse.json(updated)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictError("Já existe um item com esse nome", ERROR_CODES.catalogDuplicate)
      }
      throw e
    }
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { type, id } = await params
    if (!isCatalogType(type))
      throw new NotFoundError("Catálogo inválido", ERROR_CODES.catalogNotFound)
    const usage = await assertCanModify(user, type, id)

    // Bloqueio adicional: mesmo o admin global não remove um item em uso.
    if (usage > 0) {
      throw new ConflictError("Entrada em uso; não pode ser removida", ERROR_CODES.catalogInUse)
    }

    await deleteCatalog(type, id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
