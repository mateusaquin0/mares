// MARES — Exportação de animais selecionados (Fase 6): Darwin Core (XML) ou Excel (.xlsx).
// Recebe os ids escolhidos na lista de animais e o formato; escopa à organização ativa
// (só exporta animais cuja pesquisa pertence à org do usuário) e devolve o arquivo.

import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { getLocale } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, getActiveOrgId, requireOrgRole } from "@/lib/auth"
import { getResearchScope } from "@/lib/research-access"
import { apiError, unauthorized } from "@/lib/api"
import { buildDarwinCoreXml, dwcAnimalSelect } from "@/lib/darwin-core"
import { buildAnimalsXlsx } from "@/lib/animals-xlsx"

const exportSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  format: z.enum(["darwin-core", "xlsx"]),
})

// Campos que cobrem os dois formatos: os do Darwin Core + os extras do Excel.
const exportSelect = {
  ...dwcAnimalSelect,
  bodyCondition: true,
  decompositionStage: true,
  deathCondition: true,
  necropsyDate: true,
  isPublic: true,
  _count: { select: { samples: true } },
  // Amostras + análises (para os resultados na planilha Excel).
  samples: {
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
} as const

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const orgId = await getActiveOrgId(user)
    if (!orgId) return unauthorized()
    requireOrgRole(user, orgId, "RESEARCHER")

    const body = await req.json().catch(() => null)
    const { ids, format } = exportSchema.parse(body)

    // Escopo por pesquisa: pesquisador só exporta animais visíveis, e apenas as amostras/
    // análises das SUAS pesquisas (compartilhado → sem vazar dados de outra pesquisa).
    const scope = await getResearchScope(user, orgId)
    const animalWhere: Prisma.AnimalWhereInput = { id: { in: ids }, research: { orgId } }
    if (!scope.all) {
      animalWhere.OR = [
        { researchId: { in: scope.ids } },
        { participations: { some: { researchId: { in: scope.ids } } } },
      ]
    }

    const animals = await prisma.animal.findMany({
      where: animalWhere,
      orderBy: { eventDate: "asc" },
      select: {
        ...exportSelect,
        samples: {
          where: scope.all ? undefined : { researchId: { in: scope.ids } },
          select: exportSelect.samples.select,
        },
      },
    })

    const stamp = new Date().toISOString().slice(0, 10)

    if (format === "darwin-core") {
      const xml = buildDarwinCoreXml(animals)
      return new Response(xml, {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Content-Disposition": `attachment; filename="MARES-animais-${stamp}-darwincore.xml"`,
        },
      })
    }

    const locale = await getLocale()
    const buffer = await buildAnimalsXlsx(animals, locale)
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="MARES-animais-${stamp}.xlsx"`,
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
