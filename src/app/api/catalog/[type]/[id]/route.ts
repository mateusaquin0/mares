// MARES — Editar / remover uma entrada de catálogo global.
// Permissão: admin global sempre; senão, o CRIADOR do item enquanto ele não estiver
// em uso (protocolos / amostras / análises). A remoção é sempre bloqueada (409) se em uso.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { isCatalogType } from "@/schemas/catalog.schema"
import {
  updateCatalogItem,
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
    // Mesmo caminho da aprovação de uma solicitação de edição (ver catalog-requests.ts).
    const updated = await updateCatalogItem(type, id, body)
    return NextResponse.json(updated)
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
