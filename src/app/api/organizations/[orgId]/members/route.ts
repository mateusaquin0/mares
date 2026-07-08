// MARES — Membros de uma organização: listar e adicionar pesquisador por e-mail.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { provisionMembership } from "@/lib/members"
import { apiError, unauthorized } from "@/lib/api"
import { addMemberSchema } from "@/schemas/organization.schema"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { orgId } = await params
    // Qualquer membro da org pode ver a lista.
    requireOrgRole(user, orgId, "RESEARCHER")

    const members = await prisma.membership.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        user: { select: { id: true, name: true, email: true, status: true } },
      },
    })

    return NextResponse.json(
      members.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        status: m.user.status,
        role: m.role,
      })),
    )
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { orgId } = await params
    requireOrgRole(user, orgId, "ORG_ADMIN")

    const body = await req.json().catch(() => null)
    const data = addMemberSchema.parse(body)

    const result = await provisionMembership({
      email: data.email,
      name: data.name,
      orgId,
      role: data.role ?? "RESEARCHER",
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
