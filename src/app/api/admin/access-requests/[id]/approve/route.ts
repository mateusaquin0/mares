// MARES — Admin global aprova uma solicitação: cria a organização, convida o admin
// (ou reaproveita o usuário existente) e cria o Membership ORG_ADMIN.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { provisionMembership } from "@/lib/members"
import { apiError, unauthorized } from "@/lib/api"
import { NotFoundError, ConflictError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const { id } = await params
    const joinRequest = await prisma.joinRequest.findUnique({ where: { id } })
    if (!joinRequest)
      throw new NotFoundError("Solicitação não encontrada", ERROR_CODES.requestNotFound)
    if (joinRequest.status !== "PENDING") {
      throw new ConflictError("Solicitação já foi processada", ERROR_CODES.requestProcessed)
    }

    // Cria a organização e vincula o admin (ORG_ADMIN).
    const organization = await prisma.organization.create({
      data: { name: joinRequest.organizationName },
    })

    const result = await provisionMembership({
      email: joinRequest.email,
      name: joinRequest.requesterName,
      orgId: organization.id,
      role: "ORG_ADMIN",
    })

    await prisma.joinRequest.update({
      where: { id },
      data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date() },
    })

    return NextResponse.json({
      organization: { id: organization.id, name: organization.name },
      user: { id: result.userId, invited: result.invited },
    })
  } catch (err) {
    return apiError(err)
  }
}
