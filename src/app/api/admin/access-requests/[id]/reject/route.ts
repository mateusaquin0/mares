// MARES — Admin global rejeita uma solicitação de acesso.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { NotFoundError, ConflictError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const { id } = await params
    const joinRequest = await prisma.joinRequest.findUnique({ where: { id } })
    if (!joinRequest) throw new NotFoundError("Solicitação não encontrada", ERROR_CODES.requestNotFound)
    if (joinRequest.status !== "PENDING") {
      throw new ConflictError("Solicitação já foi processada", ERROR_CODES.requestProcessed)
    }

    await prisma.joinRequest.update({
      where: { id },
      data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date() },
    })

    return NextResponse.json({ message: "Solicitação rejeitada" })
  } catch (err) {
    return apiError(err)
  }
}
