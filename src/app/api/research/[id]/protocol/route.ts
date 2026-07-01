// MARES — Protocolo de uma pesquisa (matriz órgão × patógeno × exame): listar e adicionar.
// Ver: qualquer membro. Adicionar: admin da org.

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { protocolEntriesSchema } from "@/schemas/research.schema"
import { NotFoundError, ConflictError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

async function researchOrg(id: string) {
  const r = await prisma.research.findUnique({ where: { id }, select: { orgId: true } })
  if (!r) throw new NotFoundError("Pesquisa não encontrada", ERROR_CODES.researchNotFound)
  return r.orgId
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    requireOrgRole(user, await researchOrg(id), "RESEARCHER")

    const entries = await prisma.researchProtocol.findMany({
      where: { researchId: id },
      orderBy: { id: "asc" },
      select: {
        id: true,
        organ: { select: { id: true, name: true } },
        pathogen: { select: { id: true, scientificName: true, name: true } },
        examType: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(entries)
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    requireOrgRole(user, await researchOrg(id), "ORG_ADMIN")

    const body = await req.json().catch(() => null)
    const { entries } = protocolEntriesSchema.parse(body)

    try {
      await prisma.researchProtocol.createMany({
        data: entries.map((e) => ({ ...e, researchId: id })),
      })
    } catch (e) {
      // Viola a unique (researchId, organId, pathogenId, examTypeId).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictError("Combinação já existe no protocolo", ERROR_CODES.protocolDuplicate)
      }
      throw e
    }

    return NextResponse.json({ added: entries.length }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
