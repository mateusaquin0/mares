// MARES — Rejeitar uma solicitação de glossário (curador), com motivo opcional.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, requireCatalogReviewer } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { rejectCatalogRequestSchema } from "@/schemas/catalog-request.schema"
import { rejectCatalogRequest } from "@/lib/catalog-requests"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireCatalogReviewer(user)

    const { id } = await params
    const { note } = rejectCatalogRequestSchema.parse(await req.json().catch(() => ({})))
    await rejectCatalogRequest(id, user.id, note || null)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
