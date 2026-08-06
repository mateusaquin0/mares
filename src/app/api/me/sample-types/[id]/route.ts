// MARES — Lista pessoal de tipos de amostra: renomear e remover um item.
// Alterar aqui NÃO altera amostras já cadastradas: `Sample.sampleType` guarda o texto
// gravado no momento do cadastro — esta lista é apenas o atalho do formulário.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { ConflictError, NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { sampleTypeKey, userSampleTypeSchema } from "@/schemas/user-sample-type.schema"

const select = { id: true, value: true } as const

// Só o dono alcança o item — a busca já é escopada pelo usuário autenticado.
async function loadOwn(id: string, userId: string) {
  const item = await prisma.userSampleType.findFirst({ where: { id, userId }, select })
  if (!item) {
    throw new NotFoundError("Tipo de amostra não encontrado", ERROR_CODES.sampleTypeNotFound)
  }
  return item
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    await loadOwn(id, user.id)

    const body = await req.json().catch(() => null)
    const { value } = userSampleTypeSchema.parse(body)

    const key = sampleTypeKey(value)
    const others = await prisma.userSampleType.findMany({
      where: { userId: user.id, id: { not: id } },
      select,
    })
    if (others.some((t) => sampleTypeKey(t.value) === key)) {
      throw new ConflictError("Tipo de amostra já está na lista", ERROR_CODES.sampleTypeDuplicate)
    }

    const item = await prisma.userSampleType.update({ where: { id }, data: { value }, select })
    return NextResponse.json(item)
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    await loadOwn(id, user.id)

    await prisma.userSampleType.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
