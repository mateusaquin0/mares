// MARES — Pesquisas da organização ativa: listar e criar.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, getActiveOrgId, requireOrgRole, orgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { createResearchSchema } from "@/schemas/research.schema"

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const orgId = await getActiveOrgId(user)
    if (!orgId) return NextResponse.json([])
    requireOrgRole(user, orgId, "RESEARCHER")

    const research = await prisma.research.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        createdById: true,
        createdAt: true,
        _count: { select: { animals: true, protocols: true } },
      },
    })

    return NextResponse.json(research)
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const orgId = await getActiveOrgId(user)
    if (!orgId) return unauthorized()
    requireOrgRole(user, orgId, "RESEARCHER")

    const body = await req.json().catch(() => null)
    const data = createResearchSchema.parse(body)

    // Visibilidade pública só pode ser definida por admin da organização.
    const isOrgAdmin = orgRole(user, orgId) === "ORG_ADMIN"
    const isPublic = isOrgAdmin ? data.isPublic ?? false : false

    const research = await prisma.research.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        isPublic,
        orgId,
        createdById: user.id,
        protocols: data.protocols?.length
          ? { createMany: { data: data.protocols, skipDuplicates: true } }
          : undefined,
      },
      select: { id: true, name: true },
    })

    return NextResponse.json(research, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
