// MARES — Editar / remover uma entrada de catálogo global. Restrito ao admin global.
// A remoção é bloqueada (409) se a entrada estiver em uso (protocolos / amostras / análises).

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { isCatalogType, nameI18nSchema, pathogenSchema } from "@/schemas/catalog.schema"
import {
  findCatalog,
  updateNamed,
  updatePathogen,
  deleteCatalog,
  catalogUsage,
  type I18n,
} from "@/lib/catalog"
import { NotFoundError, ConflictError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

function buildGroup(groupPt?: string, groupEn?: string): I18n | null {
  const pt = groupPt?.trim() ?? ""
  const en = groupEn?.trim() ?? ""
  if (!pt && !en) return null
  return { pt: pt || en, en: en || pt }
}

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

    if (type === "pathogens") {
      const data = pathogenSchema.parse(body)
      const updated = await updatePathogen(id, data.name.trim(), buildGroup(data.groupPt, data.groupEn))
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
