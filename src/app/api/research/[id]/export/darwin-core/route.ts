// MARES — Exportação Darwin Core (XML) dos animais de uma pesquisa (Fase 6).
// Acesso: membro da organização dona da pesquisa (RESEARCHER+). Visibilidade
// (docs/DARWIN_CORE_EXPORT.md §7): pesquisa privada exporta todos os animais; pesquisa
// pública exporta apenas animais com isPublic = true (granularidade por animal).

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertResearchVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { buildDarwinCoreXml, dwcAnimalSelect } from "@/lib/darwin-core"
import { animalResultsSearchWhere } from "@/lib/animal-query"
import { slugify } from "@/lib/slug"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params

    const research = await prisma.research.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isPublic: true,
        orgId: true,
        organization: { select: { name: true } },
      },
    })
    if (!research) throw new NotFoundError("Pesquisa não encontrada", ERROR_CODES.researchNotFound)
    requireOrgRole(user, research.orgId, "RESEARCHER")
    await assertResearchVisible(user, research.orgId, id)

    // Filtro de busca da grade de resultados (opcional): exporta apenas os animais que casam.
    const searchWhere = animalResultsSearchWhere(req.nextUrl.searchParams.get("q") ?? "")

    const animals = await prisma.animal.findMany({
      where: {
        researchId: id,
        ...(research.isPublic ? { isPublic: true } : {}),
        ...(searchWhere ?? {}),
      },
      orderBy: { eventDate: "asc" },
      select: dwcAnimalSelect,
    })

    const xml = buildDarwinCoreXml(animals)
    const slug = slugify(research.name, "-") || "pesquisa"
    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="MARES-${slug}-darwincore.xml"`,
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
