// MARES — Pontos geográficos de encalhe para os mapas (Fase 4).
// Um "ponto" é um animal com coordenadas de encalhe (strandingLat/Lon). Serve tanto ao
// mapa público (só dados públicos) quanto ao mapa privado da organização.
//
// Visibilidade pública (docs/PERMISSOES.md): público = animal.isPublic AND research.isPublic.
// A positividade (patógenos com resultado POSITIVO) é pré-computada para alimentar o filtro
// por patógeno e o popup do marcador sem consultas adicionais no cliente.

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { pathogenName, type I18nText } from "@/lib/catalog-i18n"

// Ponto serializado enviado ao cliente (JSON-safe: datas como ISO string).
export type MapPoint = {
  id: string
  controlId: string | null
  species: string
  lat: number
  lon: number
  sex: string | null
  lifeStage: string | null
  municipality: string | null
  state: string | null
  beach: string | null
  eventDate: string | null // ISO (YYYY-MM-DD) ou null
  isPublic: boolean
  researchName: string | null
  // Patógenos com ao menos um resultado POSITIVO (nomes já resolvidos por locale).
  positivePathogens: string[]
}

// Campos carregados do banco; inclui só as análises positivas (where embutido) para
// derivar `positivePathogens` sem trazer a grade inteira.
const mapPointSelect = {
  id: true,
  controlId: true,
  species: true,
  strandingLat: true,
  strandingLon: true,
  sex: true,
  lifeStage: true,
  municipality: true,
  state: true,
  strandingBeach: true,
  eventDate: true,
  isPublic: true,
  research: { select: { name: true } },
  samples: {
    select: {
      analyses: {
        where: { result: "POSITIVO" as const },
        select: { pathogen: { select: { scientificName: true, name: true } } },
      },
    },
  },
} as const

type RawPoint = {
  id: string
  controlId: string | null
  species: string
  strandingLat: number | null
  strandingLon: number | null
  sex: string | null
  lifeStage: string | null
  municipality: string | null
  state: string | null
  strandingBeach: string | null
  eventDate: Date | null
  isPublic: boolean
  research: { name: string } | null
  samples: { analyses: { pathogen: { scientificName: string | null; name: unknown } }[] }[]
}

function toMapPoint(locale: string, a: RawPoint): MapPoint {
  const names = new Set<string>()
  for (const s of a.samples) {
    for (const an of s.analyses) {
      const label = pathogenName(locale, {
        scientificName: an.pathogen.scientificName,
        name: an.pathogen.name as I18nText | null,
      })
      if (label) names.add(label)
    }
  }
  return {
    id: a.id,
    controlId: a.controlId,
    species: a.species,
    lat: a.strandingLat as number,
    lon: a.strandingLon as number,
    sex: a.sex,
    lifeStage: a.lifeStage,
    municipality: a.municipality,
    state: a.state,
    beach: a.strandingBeach,
    eventDate: a.eventDate ? a.eventDate.toISOString().slice(0, 10) : null,
    isPublic: a.isPublic,
    researchName: a.research?.name ?? null,
    positivePathogens: [...names].sort((x, y) => x.localeCompare(y, locale)),
  }
}

// Só animais com coordenadas válidas viram ponto no mapa.
const HAS_COORDS = { strandingLat: { not: null }, strandingLon: { not: null } } as const

/** Pontos públicos (sem login): animal público E pesquisa pública, com coordenadas. */
export async function publicMapPoints(locale: string): Promise<MapPoint[]> {
  const rows = await prisma.animal.findMany({
    where: { ...HAS_COORDS, isPublic: true, research: { isPublic: true } },
    select: mapPointSelect,
    orderBy: { eventDate: "desc" },
  })
  return rows.map((r) => toMapPoint(locale, r as RawPoint))
}

/**
 * Pontos da organização (mapa privado). Admin: todos os animais da org com coordenadas.
 * Pesquisador: apenas os animais cujas pesquisas (primária ∪ participações) ele enxerga
 * (`researchIds`). `undefined` = sem restrição por pesquisa (admin).
 */
export async function orgMapPoints(
  orgId: string,
  locale: string,
  researchIds?: string[],
): Promise<MapPoint[]> {
  const where: Prisma.AnimalWhereInput = { ...HAS_COORDS, research: { orgId } }
  if (researchIds) {
    where.OR = [
      { researchId: { in: researchIds } },
      { participations: { some: { researchId: { in: researchIds } } } },
    ]
  }
  const rows = await prisma.animal.findMany({
    where,
    select: mapPointSelect,
    orderBy: { eventDate: "desc" },
  })
  return rows.map((r) => toMapPoint(locale, r as RawPoint))
}
