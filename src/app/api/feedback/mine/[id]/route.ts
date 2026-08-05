// MARES — Correção do próprio feedback pelo autor (só enquanto o status é NEW).
// Rota separada da triagem (/api/feedback/:id, admin global) de propósito: aqui o único
// papel exigido é ser o autor, e os campos editáveis são só os do relato.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { updateMyFeedbackSchema } from "@/schemas/feedback.schema"
import { updateMyFeedback } from "@/lib/feedback"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { id } = await params
    const body = await req.json().catch(() => null)
    const data = updateMyFeedbackSchema.parse(body)

    const updated = await updateMyFeedback(id, user.id, data)
    return NextResponse.json(updated)
  } catch (err) {
    return apiError(err)
  }
}
