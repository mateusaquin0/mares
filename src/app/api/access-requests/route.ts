// MARES — Solicitação de acesso de um novo admin de organização (rota pública).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { apiError, tooManyRequests } from "@/lib/api"
import { clientKey, rateLimit } from "@/lib/rate-limit"
import { accessRequestSchema } from "@/schemas/organization.schema"

export async function POST(req: NextRequest) {
  try {
    // Rota pública que grava no banco: limita solicitações por IP para conter abuso.
    const limit = rateLimit(clientKey(req, "access-request"), {
      limit: 5,
      windowMs: 60 * 60 * 1000, // 5 solicitações por hora por IP
    })
    if (!limit.ok) return tooManyRequests(limit.retryAfter)

    const body = await req.json().catch(() => null)
    const data = accessRequestSchema.parse(body)
    const email = data.email.toLowerCase().trim()

    // Evita solicitações pendentes duplicadas para o mesmo e-mail.
    const pending = await prisma.joinRequest.findFirst({
      where: { email, status: "PENDING" },
    })
    if (pending) {
      return NextResponse.json(
        { error: "Já existe uma solicitação pendente para este e-mail" },
        { status: 409 }
      )
    }

    await prisma.joinRequest.create({
      data: {
        email,
        requesterName: data.requesterName.trim(),
        organizationName: data.organizationName.trim(),
      },
    })

    return NextResponse.json({ message: "Solicitação enviada" }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
