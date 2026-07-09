// MARES — Exportação Excel (.xlsx) dos animais de uma pesquisa.
// Acesso: membro da organização dona da pesquisa (RESEARCHER+). Visibilidade
// (docs/DARWIN_CORE_EXPORT.md §7): pesquisa privada exporta todos os animais; pesquisa
// pública exporta apenas animais com isPublic = true. Só considera amostras/análises da
// própria pesquisa (indivíduos compartilhados não vazam dados de outras pesquisas).

import { NextRequest } from "next/server"
import { getLocale } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { assertResearchVisible } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { dwcAnimalSelect } from "@/lib/darwin-core"
import { animalResultsSearchWhere } from "@/lib/animal-query"
import { buildAnimalsXlsx } from "@/lib/animals-xlsx"
import { slugify } from "@/lib/slug"

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params

    const research = await prisma.research.findUnique({
      where: { id },
      select: { id: true, name: true, isPublic: true, orgId: true },
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
      select: {
        ...dwcAnimalSelect,
        bodyCondition: true,
        decompositionStage: true,
        deathCondition: true,
        necropsyDate: true,
        isPublic: true,
        _count: { select: { samples: { where: { researchId: id } } } },
        // Amostras e análises da pesquisa (para as colunas de resultados na planilha).
        samples: {
          where: { researchId: id },
          select: {
            identification: true,
            research: { select: { name: true } },
            organ: { select: { name: true } },
            analyses: {
              select: {
                result: true,
                measureValue: true,
                notes: true,
                pathogen: { select: { scientificName: true, name: true } },
                examType: { select: { name: true, measureLabel: true } },
              },
            },
          },
        },
      },
    })

    const locale = await getLocale()
    const buffer = await buildAnimalsXlsx(animals, locale)
    const slug = slugify(research.name, "-") || "pesquisa"
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="MARES-${slug}.xlsx"`,
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
