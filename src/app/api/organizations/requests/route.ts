// MARES — Solicitação de criação de um novo grupo de pesquisa, de dentro da aplicação.
//
// Mesma solicitação da porta pública (`POST /api/access-requests` → `JoinRequest`), mas para quem
// já tem conta: o solicitante sai da SESSÃO, não do corpo do pedido — do contrário qualquer
// pessoa autenticada poderia abrir uma solicitação em nome de outro e-mail. Ver src/lib/org-requests.ts.
//
// Autorização: qualquer usuário autenticado que participe de grupos (ORG_ADMIN ou RESEARCHER).
// O admin da aplicação é recusado: ele não participa de grupos. Ver docs/PERMISSOES.md.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"
import { assertCanRequestOrg } from "@/lib/org-requests"
import { newOrgRequestSchema } from "@/schemas/organization.schema"
import { rateLimit } from "@/lib/rate-limit"
import { apiError, tooManyRequests, unauthorized } from "@/lib/api"

// Solicitação em aberto do próprio usuário — o que a tela mostra no lugar do botão.
export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const pending = await prisma.joinRequest.findFirst({
      where: { email: user.email, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, organizationName: true, createdAt: true },
    })

    return NextResponse.json({ pending })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    // Cada solicitação aprovada vira um grupo: limitamos a cadência para que um engano (ou um
    // script) não encha a fila do admin da aplicação.
    const limit = rateLimit(`org-request:${user.id}`, { limit: 5, windowMs: 60 * 60 * 1000 })
    if (!limit.ok) return tooManyRequests(limit.retryAfter)

    const body = await req.json().catch(() => null)
    const { organizationName } = newOrgRequestSchema.parse(body)

    const pending = await prisma.joinRequest.findFirst({
      where: { email: user.email, status: "PENDING" },
      select: { id: true },
    })
    assertCanRequestOrg(user, !!pending)

    const created = await prisma.joinRequest.create({
      data: {
        email: user.email,
        // O nome do cadastro pode estar vazio (usuário convidado que nunca o preencheu); o
        // e-mail é o identificador estável, então serve de fallback para o admin saber quem pediu.
        requesterName: user.name?.trim() || user.email,
        organizationName: organizationName.trim(),
      },
      select: { id: true, organizationName: true, createdAt: true },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
