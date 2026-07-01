// MARES — Admin global: exclui o perfil de um usuário (Auth + banco).
// Atende ao pedido de exclusão de quem não reconhece o cadastro.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { apiError, unauthorized } from "@/lib/api"
import { NotFoundError, ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const { id } = await params
    if (id === user.id) {
      throw new ForbiddenError("Não é possível excluir o próprio usuário", ERROR_CODES.deleteSelf)
    }

    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) throw new NotFoundError("Usuário não encontrado", ERROR_CODES.userNotFound)

    // Remove no Supabase Auth; os Membership caem em cascata ao remover o User.
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error && !/not found/i.test(error.message)) {
      throw new Error(error.message)
    }

    await prisma.user.delete({ where: { id } })

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
