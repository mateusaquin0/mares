// MARES — Admin global: reenvia o convite de um usuário ainda não confirmado.
// Versão por usuário do reenvio da org (/api/organizations/:orgId/members/:userId/resend-invite),
// para atender também quem ainda não tem vínculo com nenhum grupo.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { resendInvite } from "@/lib/supabase/admin"
import { apiError, unauthorized } from "@/lib/api"
import { NotFoundError, ConflictError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const { id } = await params
    const target = await prisma.user.findUnique({
      where: { id },
      select: { email: true, status: true },
    })
    if (!target) throw new NotFoundError("Usuário não encontrado", ERROR_CODES.userNotFound)

    // Convite só é reenviável enquanto o usuário não tiver definido a senha (status INVITED).
    if (target.status !== "INVITED") {
      throw new ConflictError("Este usuário já ativou o acesso", ERROR_CODES.notInvited)
    }

    await resendInvite(target.email)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
