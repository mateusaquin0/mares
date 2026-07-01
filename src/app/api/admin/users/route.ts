// MARES — Admin global: lista todos os usuários do sistema.

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        isSystemAdmin: true,
        status: true,
        createdAt: true,
        memberships: {
          select: { orgId: true, role: true, organization: { select: { name: true } } },
        },
      },
    })

    return NextResponse.json(
      users.map((u) => ({
        ...u,
        memberships: u.memberships.map((m) => ({
          orgId: m.orgId,
          orgName: m.organization.name,
          role: m.role,
        })),
      }))
    )
  } catch (err) {
    return apiError(err)
  }
}
