// MARES — Feedback: triagem pelo admin global (mudar status / anotar).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { updateFeedbackSchema } from "@/schemas/feedback.schema"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const { id } = await params
    const body = await req.json().catch(() => null)
    const data = updateFeedbackSchema.parse(body)

    const existing = await prisma.feedback.findUnique({ where: { id }, select: { id: true } })
    if (!existing) {
      throw new NotFoundError("Feedback não encontrado", ERROR_CODES.feedbackNotFound)
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data: {
        status: data.status,
        // undefined = não altera; string vazia/null = limpa.
        adminNote: data.adminNote === undefined ? undefined : data.adminNote?.trim() || null,
      },
      select: { id: true, status: true },
    })
    return NextResponse.json(updated)
  } catch (err) {
    return apiError(err)
  }
}
