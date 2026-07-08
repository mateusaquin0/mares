// MARES — Animais da organização ativa: listar e criar (Fase 3).
// Regras (docs/PERMISSOES.md §Animais):
//  - Listar/ver/criar: qualquer membro da org (RESEARCHER+).
//  - isPublic só é definido por admin da org.

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { getLocale } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, getActiveOrgId, requireOrgRole, orgRole } from "@/lib/auth"
import { getResearchScope, assertResearchVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { createAnimalSchema } from "@/schemas/animal.schema"
import {
  animalData,
  animalDuplicateError,
  animalListSelect,
  assertResearchInOrg,
  toAnimalListItem,
} from "@/lib/animals"

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const orgId = await getActiveOrgId(user)
    if (!orgId) return NextResponse.json([])
    requireOrgRole(user, orgId, "RESEARCHER")

    const researchId = req.nextUrl.searchParams.get("researchId") ?? undefined

    // Escopo por pesquisa: admin vê todas as pesquisas da org; pesquisador só as
    // vinculadas/criadas. O conjunto efetivo de pesquisas do animal (primária ∪ participações)
    // precisa interceptar o escopo.
    const scope = await getResearchScope(user, orgId)
    if (!scope.all && researchId && !scope.ids.includes(researchId)) {
      return NextResponse.json([])
    }
    // IDs de pesquisa efetivamente usados no filtro: o filtro explícito (se houver) ou o escopo.
    const scopeIds = researchId ? [researchId] : scope.all ? undefined : scope.ids

    // Escopo pela org (via pesquisa primária, sempre da mesma org). Ao filtrar por pesquisa,
    // inclui o indivíduo tanto como primária quanto como participante (compartilhamento).
    const where: Prisma.AnimalWhereInput = { research: { orgId } }
    if (scopeIds) {
      where.OR = [
        { researchId: { in: scopeIds } },
        { participations: { some: { researchId: { in: scopeIds } } } },
      ]
    }

    const animals = await prisma.animal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: animalListSelect,
    })

    const locale = await getLocale()
    return NextResponse.json(animals.map((a) => toAnimalListItem(locale, a)))
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
    const data = createAnimalSchema.parse(body)

    await assertResearchInOrg(data.researchId, orgId)
    // Pesquisador só cria animal em pesquisa que enxerga (vinculada/criada); admin, em qualquer.
    await assertResearchVisible(user, orgId, data.researchId)

    // Visibilidade: animais são públicos por padrão (visíveis quando a pesquisa é
    // pública). Só o admin da org pode ocultar um animal (data.isPublic = false).
    const isOrgAdmin = orgRole(user, orgId) === "ORG_ADMIN"
    const isPublic = isOrgAdmin ? (data.isPublic ?? true) : true

    try {
      const animal = await prisma.animal.create({
        data: {
          ...animalData(data),
          species: data.species.trim(),
          isPublic,
          // Origem derivada do vínculo com o SIMBA (ver docs/MIGRACAO.md).
          source: data.simbaRecordNumber ? "simba" : "manual",
          orgId, // denormalizado p/ unicidade do controlId por organização
          research: { connect: { id: data.researchId } },
        },
        select: { id: true, species: true },
      })
      return NextResponse.json(animal, { status: 201 })
    } catch (e) {
      // Viola unique de controlId / simbaRecordNumber.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw animalDuplicateError(e)
      }
      throw e
    }
  } catch (err) {
    return apiError(err)
  }
}
