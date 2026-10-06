// MARES — Lista pessoal de tipos de amostra: listar e adicionar.
// Dado do próprio usuário: não depende de organização nem de papel — quem está autenticado
// só enxerga e altera a própria lista.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { ConflictError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import {
  sampleTypeKey,
  userSampleTypeSchema,
  USER_SAMPLE_TYPE_MAX,
} from "@/schemas/user-sample-type.schema"

const select = { id: true, value: true } as const

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const items = await prisma.userSampleType.findMany({
      where: { userId: user.id },
      orderBy: { value: "asc" },
      select,
    })
    return NextResponse.json(items)
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const body = await req.json().catch(() => null)
    const { value } = userSampleTypeSchema.parse(body)

    const existing = await prisma.userSampleType.findMany({
      where: { userId: user.id },
      select,
    })
    const key = sampleTypeKey(value)
    // Duplicata insensível a caixa/acento: manter as duas variantes só encheria a lista de
    // sugestões quase idênticas, que é o problema que ela existe para resolver.
    if (existing.some((t) => sampleTypeKey(t.value) === key)) {
      throw new ConflictError("Tipo de amostra já está na lista", ERROR_CODES.sampleTypeDuplicate)
    }
    if (existing.length >= USER_SAMPLE_TYPE_MAX) {
      throw new ConflictError("Lista de tipos de amostra cheia", ERROR_CODES.sampleTypeLimit)
    }

    const item = await prisma.userSampleType.create({
      data: { userId: user.id, value },
      select,
    })
    return NextResponse.json(item, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
