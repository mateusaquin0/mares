// MARES — Catálogos globais (organs / pathogens / exam-types): listar e adicionar.
// Ler: qualquer autenticado. Adicionar: qualquer admin de organização (ou admin global).
// Editar/remover: só admin global (ver [type]/[id]/route.ts).

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireAnyOrgAdmin } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { isCatalogType } from "@/schemas/catalog.schema"
import { listNamed, listPathogens, createCatalogItem } from "@/lib/catalog"
import { NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { type } = await params
    if (!isCatalogType(type))
      throw new NotFoundError("Catálogo inválido", ERROR_CODES.catalogNotFound)

    const rows = type === "pathogens" ? await listPathogens() : await listNamed(type)
    return NextResponse.json(rows)
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireAnyOrgAdmin(user)

    const { type } = await params
    if (!isCatalogType(type))
      throw new NotFoundError("Catálogo inválido", ERROR_CODES.catalogNotFound)

    const body = await req.json().catch(() => null)
    const created = await createCatalogItem(type, body, user.id)
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
