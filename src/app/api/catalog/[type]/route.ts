// MARES — Catálogos globais (organs / pathogens / exam-types): listar e adicionar.
// Ler: qualquer autenticado. Adicionar: qualquer admin de organização (ou admin global).
// Editar/remover: só admin global (ver [type]/[id]/route.ts).

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { getAuthUser, requireAnyOrgAdmin } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { isCatalogType, nameI18nSchema } from "@/schemas/catalog.schema"
import {
  listNamed,
  listPathogens,
  createNamed,
  createPathogenEntry,
  resolvePathogen,
  uniqueKey,
} from "@/lib/catalog"
import { ConflictError, NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { type } = await params
    if (!isCatalogType(type)) throw new NotFoundError("Catálogo inválido", ERROR_CODES.catalogNotFound)

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
    if (!isCatalogType(type)) throw new NotFoundError("Catálogo inválido", ERROR_CODES.catalogNotFound)

    const body = await req.json().catch(() => null)

    try {
      if (type === "pathogens") {
        const p = await resolvePathogen(body)
        const created = await createPathogenEntry({
          key: await uniqueKey(type, p.keySource),
          groupId: p.groupId,
          scientificName: p.scientificName,
          name: p.name,
          taxon: p.taxon,
          createdById: user.id,
        })
        return NextResponse.json(created, { status: 201 })
      }

      const data = nameI18nSchema.parse(body)
      const created = await createNamed(
        type,
        await uniqueKey(type, data.namePt),
        { pt: data.namePt.trim(), en: data.nameEn.trim() },
        user.id
      )
      return NextResponse.json(created, { status: 201 })
    } catch (e) {
      // Viola o índice único de nome (case-insensitive).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictError("Já existe um item com esse nome", ERROR_CODES.catalogDuplicate)
      }
      throw e
    }
  } catch (err) {
    return apiError(err)
  }
}
