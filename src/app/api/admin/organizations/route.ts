// MARES — Admin global: lista todas as organizações e seus membros (somente leitura).
// Não expõe dados científicos (apenas metadados e contagem).

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const orgs = await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        country: true,
        deactivatedAt: true,
        createdAt: true,
        _count: { select: { researches: true } },
        memberships: {
          orderBy: { createdAt: "asc" },
          select: {
            role: true,
            user: { select: { id: true, name: true, email: true, status: true } },
          },
        },
      },
    })

    return NextResponse.json(
      orgs.map((o) => ({
        id: o.id,
        name: o.name,
        city: o.city,
        state: o.state,
        country: o.country,
        deactivatedAt: o.deactivatedAt,
        createdAt: o.createdAt,
        researchCount: o._count.researches,
        members: o.memberships.map((m) => ({
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          status: m.user.status,
          role: m.role,
        })),
      })),
    )
  } catch (err) {
    return apiError(err)
  }
}
