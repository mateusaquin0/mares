// MARES — Exportação Darwin Core (XML) dos animais de uma pesquisa (Fase 6).
// Acesso: membro da organização dona da pesquisa (RESEARCHER+). Visibilidade
// (docs/DARWIN_CORE_EXPORT.md §7): pesquisa privada exporta todos os animais; pesquisa
// pública exporta apenas animais com isPublic = true (granularidade por animal).

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { NotFoundError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { buildDarwinCoreXml } from "@/lib/darwin-core"

// Combining Diacritical Marks (U+0300–U+036F) — removidos após NFD para gerar o slug.
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g")

function slugify(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(DIACRITICS, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "pesquisa"
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const animals = await prisma.animal.findMany({
      where: { researchId: id, ...(research.isPublic ? { isPublic: true } : {}) },
      orderBy: { eventDate: "asc" },
      select: {
        id: true,
        controlId: true,
        species: true,
        taxonFamily: true,
        taxonOrder: true,
        wormsAphiaId: true,
        strandingLat: true,
        strandingLon: true,
        eventDate: true,
        sex: true,
        lifeStage: true,
        municipality: true,
        state: true,
        strandingBeach: true,
        macroscopicNotes: true,
        simbaRecordNumber: true,
        research: { select: { name: true, organization: { select: { name: true } } } },
      },
    })

    const xml = buildDarwinCoreXml(animals)
    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="MARES-${slugify(research.name)}-darwincore.xml"`,
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
