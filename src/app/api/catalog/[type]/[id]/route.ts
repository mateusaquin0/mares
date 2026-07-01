// MARES — Editar / remover uma entrada de catálogo global. Restrito ao admin global.
// A remoção é bloqueada (409) se a entrada estiver em uso (protocolos / amostras / análises).

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { catalogUpdateSchema, isCatalogType } from "@/schemas/catalog.schema"
import { findCatalog, updateCatalog, deleteCatalog, catalogUsage } from "@/lib/catalog"
import { NotFoundError, ConflictError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const { type, id } = await params
    if (!isCatalogType(type)) throw new NotFoundError("Catálogo inválido", ERROR_CODES.catalogNotFound)
    if (!(await findCatalog(type, id)))
      throw new NotFoundError("Entrada não encontrada", ERROR_CODES.catalogNotFound)

    const body = await req.json().catch(() => null)
    const data = catalogUpdateSchema.parse(body)

    const norm = (v?: string) => (v && v.trim() ? v.trim() : null)
    const updated = await updateCatalog(type, id, {
      namePt: data.namePt?.trim(),
      nameEn: data.nameEn?.trim(),
      groupPt: data.groupPt === undefined ? undefined : norm(data.groupPt),
      groupEn: data.groupEn === undefined ? undefined : norm(data.groupEn),
    })

    return NextResponse.json(updated)
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const { type, id } = await params
    if (!isCatalogType(type)) throw new NotFoundError("Catálogo inválido", ERROR_CODES.catalogNotFound)
    if (!(await findCatalog(type, id)))
      throw new NotFoundError("Entrada não encontrada", ERROR_CODES.catalogNotFound)

    if ((await catalogUsage(type, id)) > 0) {
      throw new ConflictError("Entrada em uso; não pode ser removida", ERROR_CODES.catalogInUse)
    }

    await deleteCatalog(type, id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
