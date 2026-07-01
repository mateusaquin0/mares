// MARES — Dados de uma organização: ler (qualquer membro) e editar (admin da org).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { updateOrganizationSchema } from "@/schemas/organization.schema"
import { NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { orgId } = await params
    requireOrgRole(user, orgId, "RESEARCHER")

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, city: true, state: true, country: true },
    })
    if (!org) throw new NotFoundError("Organização não encontrada", ERROR_CODES.orgNotFound)

    return NextResponse.json(org)
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { orgId } = await params
    requireOrgRole(user, orgId, "ORG_ADMIN")

    const body = await req.json().catch(() => null)
    const data = updateOrganizationSchema.parse(body)

    // Strings vazias viram null (campos de localização são opcionais).
    const norm = (v?: string) => (v && v.trim() ? v.trim() : null)

    const org = await prisma.organization.update({
      where: { id: orgId },
      data: {
        name: data.name.trim(),
        city: norm(data.city),
        state: norm(data.state),
        country: norm(data.country),
      },
      select: { id: true, name: true, city: true, state: true, country: true },
    })

    return NextResponse.json(org)
  } catch (err) {
    return apiError(err)
  }
}
