// MARES — Provisionamento de vínculos (Membership), compartilhado entre a criação de
// pesquisadores (admin) e a aprovação de solicitações de acesso (admin global).

import { prisma } from "@/lib/prisma"
import { inviteUser } from "@/lib/supabase/admin"
import { ConflictError, ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import type { MembershipRole } from "@prisma/client"

export type ProvisionResult = {
  userId: string
  role: MembershipRole
  invited: boolean
  reusedExistingUser: boolean
}

// Garante que o usuário do e-mail existe (convidando se necessário) e o vincula à org.
// - Se o e-mail já é usuário: cria só o Membership (409 se já for membro da org).
// - Se o e-mail é novo: exige `name`, convida via Supabase e cria User + Membership.
export async function provisionMembership(params: {
  email: string
  name?: string
  orgId: string
  role: MembershipRole
}): Promise<ProvisionResult> {
  const email = params.email.toLowerCase().trim()
  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    // Admin global não participa de organizações — o isSystemAdmin já concede acesso a todas.
    if (existing.isSystemAdmin) {
      throw new ConflictError(
        "Administradores globais não participam de organizações",
        ERROR_CODES.systemAdminNoOrg,
      )
    }

    const already = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: existing.id, orgId: params.orgId } },
    })
    if (already)
      throw new ConflictError("E-mail já é membro desta organização", ERROR_CODES.alreadyMember)

    await prisma.membership.create({
      data: { userId: existing.id, orgId: params.orgId, role: params.role },
    })
    return { userId: existing.id, role: params.role, invited: false, reusedExistingUser: true }
  }

  if (!params.name || params.name.trim().length < 2) {
    throw new ValidationError(
      "Nome é obrigatório para convidar um novo usuário",
      ERROR_CODES.nameRequired,
    )
  }

  // Convida no Supabase Auth (envia o link para definir a senha) e cria o registro local.
  const userId = await inviteUser(email)
  await prisma.user.create({
    data: { id: userId, email, name: params.name.trim(), status: "INVITED" },
  })
  await prisma.membership.create({
    data: { userId, orgId: params.orgId, role: params.role },
  })
  return { userId, role: params.role, invited: true, reusedExistingUser: false }
}
