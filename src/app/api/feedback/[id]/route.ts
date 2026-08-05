// MARES — Feedback: triagem pelo admin global (status, anotação interna e resposta ao autor).
// Descartar (WONT_FIX) exige justificativa — regra em src/lib/feedback.ts.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { updateFeedbackSchema } from "@/schemas/feedback.schema"
import { updateFeedback } from "@/lib/feedback"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const { id } = await params
    const body = await req.json().catch(() => null)
    const data = updateFeedbackSchema.parse(body)

    const updated = await updateFeedback(id, user.id, data)
    return NextResponse.json(updated)
  } catch (err) {
    return apiError(err)
  }
}
