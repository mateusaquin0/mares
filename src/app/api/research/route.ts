// MARES — Pesquisas da organização ativa: listar e criar.

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAuthUser, getActiveOrgId, requireOrgRole } from "@/lib/auth"
import { getResearchScope } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { createResearchSchema } from "@/schemas/research.schema"

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const orgId = await getActiveOrgId(user)
    if (!orgId) return NextResponse.json([])
    requireOrgRole(user, orgId, "RESEARCHER")

    // Escopo por pesquisa: admin vê todas; pesquisador só as vinculadas/criadas.
    const scope = await getResearchScope(user, orgId)
    const where: Prisma.ResearchWhereInput = scope.all
      ? { orgId }
      : { orgId, id: { in: scope.ids } }

    const research = await prisma.research.findMany({
      where,
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

    const research = await prisma.research.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        // Quem cria é o criador: decide a visibilidade da própria pesquisa.
        isPublic: data.isPublic ?? false,
        orgId,
        createdById: user.id,
        // O criador entra automaticamente como membro (escopo de visibilidade).
        members: { create: { userId: user.id } },
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
