// MARES — Admin global: altera o papel ou remove um membro de QUALQUER grupo de pesquisa.
// Sem as restrições de governança da org (o admin global é confiável); remover o último
// membro desativa o grupo. Ver docs/PERMISSOES.md.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { deactivateOrgIfEmpty } from "@/lib/org-lifecycle"
import { apiError, unauthorized } from "@/lib/api"
import { updateMemberRoleSchema } from "@/schemas/organization.schema"
import { NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; userId: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const { orgId, userId } = await params
    const body = await req.json().catch(() => null)
    const { role } = updateMemberRoleSchema.parse(body)

    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
    })
    if (!membership) throw new NotFoundError("Membro não encontrado", ERROR_CODES.memberNotFound)

    const updated = await prisma.membership.update({
      where: { userId_orgId: { userId, orgId } },
      data: { role },
    })

    return NextResponse.json({ userId, role: updated.role })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; userId: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const { orgId, userId } = await params
    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
    })
    if (!membership) throw new NotFoundError("Membro não encontrado", ERROR_CODES.memberNotFound)

    await prisma.membership.delete({ where: { userId_orgId: { userId, orgId } } })
    const deactivated = await deactivateOrgIfEmpty(orgId)

    return NextResponse.json({ orgDeactivated: deactivated })
  } catch (err) {
    return apiError(err)
  }
}
