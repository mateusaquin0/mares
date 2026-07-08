// MARES — Alterar o papel de um membro ou removê-lo/sair da organização.
// Regras (ver docs/PERMISSOES.md e docs/CADASTRO_E_ACESSO.md):
//  - Qualquer admin adiciona/remove pesquisadores.
//  - Admin NÃO pode remover nem rebaixar OUTRO admin; pode promover pesquisador → admin.
//  - Admin pode se rebaixar a pesquisador ou sair por conta própria.
//  - Se ele for o ÚLTIMO admin: com dados na org, é bloqueado até promover outro;
//    sem dados, ao sair a organização é excluída.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { deactivateOrgIfEmpty } from "@/lib/org-lifecycle"
import { apiError, unauthorized } from "@/lib/api"
import { updateMemberRoleSchema } from "@/schemas/organization.schema"
import { NotFoundError, ConflictError, ForbiddenError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

async function orgAdminCount(orgId: string) {
  return prisma.membership.count({ where: { orgId, role: "ORG_ADMIN" } })
}

async function orgMemberCount(orgId: string) {
  return prisma.membership.count({ where: { orgId } })
}

async function orgHasData(orgId: string) {
  const research = await prisma.research.count({ where: { orgId } })
  return research > 0
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; userId: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { orgId, userId } = await params
    requireOrgRole(user, orgId, "ORG_ADMIN")

    const body = await req.json().catch(() => null)
    const { role } = updateMemberRoleSchema.parse(body)

    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
    })
    if (!membership) throw new NotFoundError("Membro não encontrado", ERROR_CODES.memberNotFound)

    const isSelf = userId === user.id

    if (!isSelf) {
      // Não é permitido alterar o papel de outro administrador.
      if (membership.role === "ORG_ADMIN") {
        throw new ForbiddenError(
          "Não é possível alterar o papel de outro administrador",
          ERROR_CODES.changeOtherAdmin,
        )
      }
      // Pesquisador → pode ser promovido a admin (ou manter pesquisador).
    } else {
      // Autoalteração: só faz sentido rebaixar-se de admin para pesquisador.
      if (membership.role === "ORG_ADMIN" && role === "RESEARCHER") {
        if ((await orgAdminCount(orgId)) <= 1) {
          throw new ConflictError(
            "Você é o único administrador; promova outro antes de deixar de ser admin",
            ERROR_CODES.lastAdminDemote,
          )
        }
      }
    }

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
    const { orgId, userId } = await params
    const isSelf = userId === user.id

    // Remover OUTRO membro exige ser admin da org. Sair de si mesmo: qualquer membro pode.
    if (!isSelf) {
      requireOrgRole(user, orgId, "ORG_ADMIN")

      const membership = await prisma.membership.findUnique({
        where: { userId_orgId: { userId, orgId } },
      })
      if (!membership) throw new NotFoundError("Membro não encontrado", ERROR_CODES.memberNotFound)
      if (membership.role === "ORG_ADMIN") {
        throw new ForbiddenError(
          "Não é possível remover outro administrador",
          ERROR_CODES.removeOtherAdmin,
        )
      }
      await prisma.membership.delete({ where: { userId_orgId: { userId, orgId } } })
      // Remover o último membro (ex.: único pesquisador) desativa o grupo.
      const deactivated = await deactivateOrgIfEmpty(orgId)
      return deactivated
        ? NextResponse.json({ orgDeactivated: true })
        : new NextResponse(null, { status: 204 })
    }

    // Saída por conta própria (pesquisador ou admin).
    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
    })
    if (!membership)
      throw new NotFoundError("Você não pertence a esta organização", ERROR_CODES.notMember)

    if (membership.role === "ORG_ADMIN" && (await orgAdminCount(orgId)) <= 1) {
      // Último admin saindo. Se o grupo tem dados e AINDA há outros membros, exige um
      // sucessor (senão o grupo ficaria com pesquisadores mas sem admin). Se ele é o
      // último membro, o grupo é desativado (dados públicos permanecem visíveis).
      if ((await orgHasData(orgId)) && (await orgMemberCount(orgId)) > 1) {
        throw new ConflictError(
          "A organização possui dados; promova outro administrador antes de sair",
          ERROR_CODES.lastAdminHasData,
        )
      }
      await prisma.membership.delete({ where: { userId_orgId: { userId, orgId } } })
      const deactivated = await deactivateOrgIfEmpty(orgId)
      return deactivated
        ? NextResponse.json({ orgDeactivated: true })
        : new NextResponse(null, { status: 204 })
    }

    await prisma.membership.delete({ where: { userId_orgId: { userId, orgId } } })
    const deactivated = await deactivateOrgIfEmpty(orgId)
    return deactivated
      ? NextResponse.json({ orgDeactivated: true })
      : new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
