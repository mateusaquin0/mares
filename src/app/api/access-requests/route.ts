// MARES — Solicitação de acesso de um novo admin de organização (rota pública).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { apiError } from "@/lib/api"
import { accessRequestSchema } from "@/schemas/organization.schema"

export async function POST(req: NextRequest) {
  try {
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
