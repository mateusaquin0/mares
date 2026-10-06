// MARES — Reabertura de um ticket encerrado, pedida pelo AUTOR.
// Fica sob /mine porque o único papel exigido é ser o autor: o admin não "reabre" por aqui
// (ele tria pelo PATCH /api/feedback/:id). A justificativa vira a primeira mensagem da
// conversa reaberta. Ver docs/FEEDBACK.md.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth"
import { apiError, tooManyRequests, unauthorized } from "@/lib/api"
import { rateLimit } from "@/lib/rate-limit"
import { reopenFeedbackSchema } from "@/schemas/feedback.schema"
import { requestReopen } from "@/lib/feedback"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    // Teto de abuso: reabrir é barato para quem pede e caro para quem tria.
    const limit = rateLimit(`feedback-reopen:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 })
    if (!limit.ok) return tooManyRequests(limit.retryAfter)

    const { id } = await params
    const body = await req.json().catch(() => null)
    const data = reopenFeedbackSchema.parse(body)

    const updated = await requestReopen(id, user, data.reason)
    return NextResponse.json(updated)
  } catch (err) {
    return apiError(err)
  }
}
