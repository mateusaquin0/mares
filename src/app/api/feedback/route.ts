// MARES — Feedback: envio (usuário autenticado) e listagem (admin global).
// Regras: qualquer usuário logado envia (com rate limit); só o admin global lista.

import { NextRequest, NextResponse } from "next/server"
import type { FeedbackStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAuthUser, getActiveOrgId, requireSystemAdmin } from "@/lib/auth"
import { apiError, tooManyRequests, unauthorized } from "@/lib/api"
import { rateLimit } from "@/lib/rate-limit"
import { createFeedbackSchema } from "@/schemas/feedback.schema"

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    // Limite por usuário para conter abuso/spam.
    const limit = rateLimit(`feedback:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 })
    if (!limit.ok) return tooManyRequests(limit.retryAfter)

    const body = await req.json().catch(() => null)
    const data = createFeedbackSchema.parse(body)
    const orgId = await getActiveOrgId(user)

    const created = await prisma.feedback.create({
      data: {
        type: data.type,
        message: data.message.trim(),
        pageUrl: data.pageUrl?.trim() || null,
        createdById: user.id,
        createdByEmail: user.email,
        orgId: orgId ?? null,
      },
      select: { id: true },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const statusParam = req.nextUrl.searchParams.get("status")
    const valid: FeedbackStatus[] = ["NEW", "IN_REVIEW", "RESOLVED", "WONT_FIX"]
    const where =
      statusParam && valid.includes(statusParam as FeedbackStatus)
        ? { status: statusParam as FeedbackStatus }
        : {}

    const items = await prisma.feedback.findMany({ where, orderBy: { createdAt: "desc" } })
    return NextResponse.json(items)
  } catch (err) {
    return apiError(err)
  }
}
