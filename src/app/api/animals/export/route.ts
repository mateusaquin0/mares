// MARES — Exportação de animais selecionados (Fase 6): Darwin Core (XML) ou Excel (.xlsx).
// Recebe os ids escolhidos na lista de animais e o formato; escopa à organização ativa
// (só exporta animais cuja pesquisa pertence à org do usuário) e devolve o arquivo.

import { NextRequest } from "next/server"
import { z } from "zod"
import { getLocale } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, getActiveOrgId, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { buildDarwinCoreXml } from "@/lib/darwin-core"
import { buildAnimalsXlsx } from "@/lib/animals-xlsx"

const exportSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  format: z.enum(["darwin-core", "xlsx"]),
})

// Campos que cobrem os dois formatos (Darwin Core e Excel).
const exportSelect = {
  id: true,
  controlId: true,
  simbaRecordNumber: true,
  species: true,
  taxonFamily: true,
  taxonOrder: true,
  wormsAphiaId: true,
  sex: true,
  lifeStage: true,
  bodyCondition: true,
  decompositionStage: true,
  deathCondition: true,
  eventDate: true,
  necropsyDate: true,
  municipality: true,
  state: true,
  strandingBeach: true,
  strandingLat: true,
  strandingLon: true,
  isPublic: true,
  macroscopicNotes: true,
  research: { select: { name: true, organization: { select: { name: true } } } },
  _count: { select: { samples: true } },
  // Amostras + análises (para os resultados na planilha Excel).
  samples: {
    select: {
      identification: true,
      organ: { select: { name: true } },
      analyses: {
        select: {
          result: true,
          ctValue: true,
          notes: true,
          pathogen: { select: { scientificName: true, name: true } },
          examType: { select: { name: true } },
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

    const animals = await prisma.animal.findMany({
      where: { id: { in: ids }, research: { orgId } },
      orderBy: { eventDate: "asc" },
      select: exportSelect,
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
