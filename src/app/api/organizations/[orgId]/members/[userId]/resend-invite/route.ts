// MARES — Reenviar o convite de um membro ainda não confirmado.
// O link do convite invalida no primeiro acesso; se o usuário o perder ou invalidar por
// acidente, um admin da org reenvia por aqui. Só faz sentido para membros INVITED.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { resendInvite } from "@/lib/supabase/admin"
import { apiError, unauthorized } from "@/lib/api"
import { NotFoundError, ConflictError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; userId: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { orgId, userId } = await params
    requireOrgRole(user, orgId, "ORG_ADMIN")

    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { user: { select: { email: true, status: true } } },
    })
    if (!membership) throw new NotFoundError("Membro não encontrado", ERROR_CODES.memberNotFound)

    // Convite só é reenviável enquanto o usuário não tiver definido a senha (status INVITED).
    if (membership.user.status !== "INVITED") {
      throw new ConflictError("Este usuário já ativou o acesso", ERROR_CODES.notInvited)
    }

    await resendInvite(membership.user.email)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
