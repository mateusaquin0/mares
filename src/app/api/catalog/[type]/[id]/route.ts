// MARES — Editar / remover uma entrada de catálogo global. Restrito ao admin global.
// A remoção é bloqueada (409) se a entrada estiver em uso (protocolos / amostras / análises).

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { isCatalogType, nameI18nSchema } from "@/schemas/catalog.schema"
import {
  catalogExists,
  updateNamed,
  updatePathogenEntry,
  resolvePathogen,
  deleteCatalog,
  catalogUsage,
} from "@/lib/catalog"
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
    if (!(await catalogExists(type, id)))
      throw new NotFoundError("Entrada não encontrada", ERROR_CODES.catalogNotFound)

    const body = await req.json().catch(() => null)

    if (type === "pathogens") {
      const p = await resolvePathogen(body)
      const updated = await updatePathogenEntry(id, {
        groupId: p.groupId,
        scientificName: p.scientificName,
        name: p.name,
      })
      return NextResponse.json(updated)
    }

    const data = nameI18nSchema.parse(body)
    const updated = await updateNamed(type, id, { pt: data.namePt.trim(), en: data.nameEn.trim() })
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
    if (!(await catalogExists(type, id)))
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
