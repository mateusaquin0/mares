// MARES — Parsing e construção da consulta da listagem de animais (paginação server-side).
// Compartilhado entre GET /api/animals (página + idsOnly) e a contagem total.

import { Prisma } from "@prisma/client"

import type { AnimalSortKey } from "@/types/animal"

export const ANIMAL_PAGE_SIZES = [10, 20, 30] as const
export const DEFAULT_PAGE_SIZE = 20

// Colunas ordenáveis → orderBy do Prisma. Default: data do encalhe desc (nulos por último).
export type AnimalListFilters = {
  q: string
  species: string[]
  sex: string[]
  lifeStage: string[]
  state: string[]
  research: string[]
  pathogen: string[]
  visibility: "all" | "public" | "private"
  samples: "all" | "with" | "without"
  from: string
  to: string
  sort: AnimalSortKey
  dir: "asc" | "desc"
  page: number
  pageSize: number
  idsOnly: boolean
}

const SORT_KEYS: AnimalSortKey[] = [
  "control",
  "species",
  "sex",
  "location",
  "date",
  "isPublic",
  "samples",
  "research",
]

// Aceita valores repetidos (?x=a&x=b) ou separados por vírgula (?x=a,b).
function multi(sp: URLSearchParams, key: string): string[] {
  return sp
    .getAll(key)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean)
}

export function parseAnimalListParams(sp: URLSearchParams): AnimalListFilters {
  const pageSizeRaw = Number(sp.get("pageSize"))
  const pageSize = (ANIMAL_PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
    ? pageSizeRaw
    : DEFAULT_PAGE_SIZE
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const sortRaw = sp.get("sort") as AnimalSortKey | null
  const sort = sortRaw && SORT_KEYS.includes(sortRaw) ? sortRaw : "date"
  const dir = sp.get("dir") === "asc" ? "asc" : "desc"
  const visibility = sp.get("visibility")
  const samples = sp.get("samples")

  return {
    q: sp.get("q")?.trim() ?? "",
    species: multi(sp, "species"),
    sex: multi(sp, "sex"),
    lifeStage: multi(sp, "lifeStage"),
    state: multi(sp, "state"),
    research: multi(sp, "research"),
    pathogen: multi(sp, "pathogen"),
    visibility: visibility === "public" || visibility === "private" ? visibility : "all",
    samples: samples === "with" || samples === "without" ? samples : "all",
    from: sp.get("from")?.trim() ?? "",
    to: sp.get("to")?.trim() ?? "",
    sort,
    dir,
    page,
    pageSize,
    idsOnly: sp.get("idsOnly") === "1",
  }
}

// Busca textual da grade de resultados: mesmos campos do filtro client-side (results-manager).
// Retorna null quando o termo é vazio (nenhum filtro a aplicar).
export function animalResultsSearchWhere(q: string): Prisma.AnimalWhereInput | null {
  const term = q.trim()
  if (!term) return null
  const contains = { contains: term, mode: "insensitive" as const }
  return {
    OR: [
      { controlId: contains },
      { simbaRecordNumber: contains },
      { species: contains },
      { municipality: contains },
      { state: contains },
      { strandingBeach: contains },
    ],
  }
}

// Cláusula base do escopo: organização + pesquisas visíveis (via primária ou participação).
export function animalScopeWhere(orgId: string, scopeIds?: string[]): Prisma.AnimalWhereInput {
  const where: Prisma.AnimalWhereInput = { research: { orgId } }
  if (scopeIds) {
    where.OR = [
      { researchId: { in: scopeIds } },
      { participations: { some: { researchId: { in: scopeIds } } } },
    ]
  }
  return where
}

// Where completo = escopo + filtros do usuário. Cada filtro vira uma cláusula do AND.
export function buildAnimalWhere(
  orgId: string,
  scopeIds: string[] | undefined,
  f: AnimalListFilters,
): Prisma.AnimalWhereInput {
  const and: Prisma.AnimalWhereInput[] = [animalScopeWhere(orgId, scopeIds)]

  if (f.species.length) and.push({ species: { in: f.species } })
  if (f.sex.length) and.push({ sex: { in: f.sex } })
  if (f.lifeStage.length) and.push({ lifeStage: { in: f.lifeStage } })
  if (f.state.length) and.push({ state: { in: f.state } })

  // Pesquisa: considera primária OU participação (compartilhamento do indivíduo).
  if (f.research.length) {
    and.push({
      OR: [
        { researchId: { in: f.research } },
        { participations: { some: { researchId: { in: f.research } } } },
      ],
    })
  }

  // Patógeno positivo: existe amostra com análise POSITIVO para o patógeno.
  if (f.pathogen.length) {
    and.push({
      samples: {
        some: { analyses: { some: { result: "POSITIVO", pathogenId: { in: f.pathogen } } } },
      },
    })
  }

  // Visibilidade pública EFETIVA = animal.isPublic E research.isPublic.
  if (f.visibility === "public") and.push({ isPublic: true, research: { isPublic: true } })
  if (f.visibility === "private") {
    and.push({ OR: [{ isPublic: false }, { research: { isPublic: false } }] })
  }

  if (f.samples === "with") and.push({ samples: { some: {} } })
  if (f.samples === "without") and.push({ samples: { none: {} } })

  if (f.from || f.to) {
    and.push({
      eventDate: {
        ...(f.from ? { gte: new Date(f.from) } : {}),
        ...(f.to ? { lte: new Date(`${f.to}T23:59:59.999Z`) } : {}),
      },
    })
  }

  if (f.q) {
    const contains = { contains: f.q, mode: "insensitive" as const }
    and.push({
      OR: [
        { controlId: contains },
        { simbaRecordNumber: contains },
        { species: contains },
        { municipality: contains },
        { state: contains },
        { research: { name: contains } },
      ],
    })
  }

  return { AND: and }
}

export function animalOrderBy(
  sort: AnimalSortKey,
  dir: "asc" | "desc",
): Prisma.AnimalOrderByWithRelationInput {
  switch (sort) {
    case "control":
      return { controlId: dir }
    case "species":
      return { species: dir }
    case "sex":
      return { sex: dir }
    case "location":
      return { municipality: dir }
    case "isPublic":
      return { isPublic: dir }
    case "research":
      return { research: { name: dir } }
    case "samples":
      return { samples: { _count: dir } }
    case "date":
    default:
      return { eventDate: { sort: dir, nulls: "last" } }
  }
}
