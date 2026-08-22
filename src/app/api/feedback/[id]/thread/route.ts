// MARES — Conversa de um ticket de feedback (autor ↔ administração).
// Uma rota para os dois lados: quem pode ler/escrever é resolvido em `loadThreadAccess`
// (autor do ticket ou admin global), que também devolve o LADO de quem chamou. Escrever
// exige o ticket aberto; encerrado, a conversa fecha para os dois. Ver docs/FEEDBACK.md.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth"
import { apiError, tooManyRequests, unauthorized } from "@/lib/api"
import { rateLimit } from "@/lib/rate-limit"
import { createFeedbackMessageSchema } from "@/schemas/feedback.schema"
import { addThreadMessage, listThread, loadThreadAccess, markThreadRead } from "@/lib/feedback"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { id } = await params
    const access = await loadThreadAccess(id, user)
    return NextResponse.json(await listThread(id, access))
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    // Mesmo teto de abuso do envio de feedback, um pouco mais folgado: conversar é o uso
    // esperado desta rota.
    const limit = rateLimit(`feedback-msg:${user.id}`, { limit: 30, windowMs: 60 * 60 * 1000 })
    if (!limit.ok) return tooManyRequests(limit.retryAfter)

    const { id } = await params
    const access = await loadThreadAccess(id, user)
    const body = await req.json().catch(() => null)
    const data = createFeedbackMessageSchema.parse(body)

    const message = await addThreadMessage(id, user, access.party, data.body)
    return NextResponse.json(message, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}

// Marca a conversa como lida por quem chamou. Fica separado do GET de propósito: assim ler
// a thread não tem efeito colateral, e a UI decide quando a conversa foi de fato vista.
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { id } = await params
    const access = await loadThreadAccess(id, user)
    await markThreadRead(id, access.party)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
