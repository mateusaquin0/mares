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
import { animalOrderBy, buildAnimalWhere, parseAnimalListParams } from "@/lib/animal-query"

// Listagem paginada, filtrada e ordenada no servidor. Ver docs/CONTRATO_API.md §1.
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const orgId = await getActiveOrgId(user)
    if (!orgId) return NextResponse.json({ items: [], total: 0, page: 1, pageSize: 20 })
    requireOrgRole(user, orgId, "RESEARCHER")

    const filters = parseAnimalListParams(req.nextUrl.searchParams)

    // Escopo por pesquisa: admin vê todas as pesquisas da org; pesquisador só as
    // vinculadas/criadas. O conjunto efetivo do animal (primária ∪ participações) intercepta.
    const scope = await getResearchScope(user, orgId)
    const scopeIds = scope.all ? undefined : scope.ids
    // Pesquisador sem nenhuma pesquisa visível → conjunto vazio (evita where OR: { in: [] }).
    if (scopeIds && scopeIds.length === 0) {
      return filters.idsOnly
        ? NextResponse.json({ ids: [] })
        : NextResponse.json({ items: [], total: 0, page: filters.page, pageSize: filters.pageSize })
    }

    const where = buildAnimalWhere(orgId, scopeIds, filters)

    // Modo "selecionar todos": só os ids que casam com o filtro (todas as páginas).
    if (filters.idsOnly) {
      const rows = await prisma.animal.findMany({ where, select: { id: true } })
      return NextResponse.json({ ids: rows.map((r) => r.id) })
    }

    const [total, animals] = await Promise.all([
      prisma.animal.count({ where }),
      prisma.animal.findMany({
        where,
        orderBy: animalOrderBy(filters.sort, filters.dir),
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        select: animalListSelect,
      }),
    ])

    const locale = await getLocale()
    return NextResponse.json({
      items: animals.map((a) => toAnimalListItem(locale, a)),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    })
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
