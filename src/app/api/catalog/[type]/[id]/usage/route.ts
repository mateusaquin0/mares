// MARES — Indicador de uso de um item de glossário (só admin global). Devolve apenas
// contagens de DISTINTOS (pesquisas / grupos), nunca ids — privacidade por construção.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { isCatalogType } from "@/schemas/catalog.schema"
import { catalogUsageBreakdown } from "@/lib/catalog"
import { NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const { type, id } = await params
    if (!isCatalogType(type))
      throw new NotFoundError("Catálogo inválido", ERROR_CODES.catalogNotFound)

    const usage = await catalogUsageBreakdown(type, id)
    return NextResponse.json(usage)
  } catch (err) {
    return apiError(err)
  }
}
