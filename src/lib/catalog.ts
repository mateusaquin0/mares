// MARES — Acesso aos catálogos globais.
// Órgão/Exame: `name` JSON { pt, en }. Patógeno: pertence a um PathogenGroup e tem
// `scientificName` (grupos científicos) OU `name` JSON { pt, en } (grupos comuns).

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { CatalogType } from "@/schemas/catalog.schema"
import { pathogenSchema } from "@/schemas/catalog.schema"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export type I18n = { pt: string; en: string }

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

// ── Órgão / Exame (name JSON) ───────────────────────────────────────────────

export type NamedType = "organs" | "exam-types"
export type NamedRow = { id: string; key: string; name: Prisma.JsonValue }

const namedSelect = { id: true, key: true, name: true }

export async function listNamed(type: NamedType): Promise<NamedRow[]> {
  return type === "organs"
    ? prisma.organ.findMany({ orderBy: { key: "asc" }, select: namedSelect })
    : prisma.examType.findMany({ orderBy: { key: "asc" }, select: namedSelect })
}

export async function createNamed(type: NamedType, key: string, name: I18n): Promise<NamedRow> {
  const data = { key, name }
  return type === "organs"
    ? prisma.organ.create({ data, select: namedSelect })
    : prisma.examType.create({ data, select: namedSelect })
}

export async function updateNamed(type: NamedType, id: string, name: I18n): Promise<NamedRow> {
  return type === "organs"
    ? prisma.organ.update({ where: { id }, data: { name }, select: namedSelect })
    : prisma.examType.update({ where: { id }, data: { name }, select: namedSelect })
}

// ── Patógeno + Grupo ────────────────────────────────────────────────────────

export type PathogenGroupRow = {
  id: string
  key: string
  name: Prisma.JsonValue
  usesScientificName: boolean
}
export type PathogenRow = {
  id: string
  key: string
  scientificName: string | null
  name: Prisma.JsonValue | null
  group: PathogenGroupRow
}

const pathogenSelect = {
  id: true,
  key: true,
  scientificName: true,
  name: true,
  group: { select: { id: true, key: true, name: true, usesScientificName: true } },
} satisfies Prisma.PathogenSelect

export async function listPathogenGroups(): Promise<PathogenGroupRow[]> {
  return prisma.pathogenGroup.findMany({
    orderBy: { key: "asc" },
    select: { id: true, key: true, name: true, usesScientificName: true },
  })
}

export async function findPathogenGroup(
  id: string
): Promise<{ id: string; usesScientificName: boolean } | null> {
  return prisma.pathogenGroup.findUnique({
    where: { id },
    select: { id: true, usesScientificName: true },
  })
}

export async function listPathogens(): Promise<PathogenRow[]> {
  return prisma.pathogen.findMany({
    orderBy: [{ group: { key: "asc" } }, { scientificName: "asc" }],
    select: pathogenSelect,
  })
}

export async function createPathogenEntry(data: {
  key: string
  groupId: string
  scientificName: string | null
  name: I18n | null
}): Promise<PathogenRow> {
  return prisma.pathogen.create({
    data: {
      key: data.key,
      groupId: data.groupId,
      scientificName: data.scientificName,
      name: data.name ?? Prisma.DbNull,
    },
    select: pathogenSelect,
  })
}

export async function updatePathogenEntry(
  id: string,
  data: { groupId: string; scientificName: string | null; name: I18n | null }
): Promise<PathogenRow> {
  return prisma.pathogen.update({
    where: { id },
    data: {
      groupId: data.groupId,
      scientificName: data.scientificName,
      name: data.name ?? Prisma.DbNull,
    },
    select: pathogenSelect,
  })
}

// Valida o corpo do patógeno conforme o grupo (científico exige scientificName; comum exige
// namePt + nameEn). Retorna os dados normalizados + a fonte do `key`.
export async function resolvePathogen(body: unknown): Promise<{
  groupId: string
  scientificName: string | null
  name: I18n | null
  keySource: string
}> {
  const data = pathogenSchema.parse(body)
  const group = await findPathogenGroup(data.groupId)
  if (!group) throw new NotFoundError("Grupo não encontrado", ERROR_CODES.catalogNotFound)

  if (group.usesScientificName) {
    const sci = data.scientificName?.trim()
    if (!sci) throw new ValidationError("Nome científico é obrigatório", ERROR_CODES.catalogNameRequired)
    return { groupId: group.id, scientificName: sci, name: null, keySource: sci }
  }
  const pt = data.namePt?.trim()
  const en = data.nameEn?.trim()
  if (!pt || !en) throw new ValidationError("Nome (PT e EN) é obrigatório", ERROR_CODES.catalogNameRequired)
  return { groupId: group.id, scientificName: null, name: { pt, en }, keySource: pt }
}

// ── Genéricos (todos os tipos) ──────────────────────────────────────────────

export async function keyExists(type: CatalogType, key: string): Promise<boolean> {
  const args = { where: { key }, select: { id: true } }
  if (type === "organs") return !!(await prisma.organ.findUnique(args))
  if (type === "pathogens") return !!(await prisma.pathogen.findUnique(args))
  return !!(await prisma.examType.findUnique(args))
}

export async function uniqueKey(type: CatalogType, name: string): Promise<string> {
  const base = slugify(name) || "item"
  let key = base
  let n = 2
  while (await keyExists(type, key)) {
    key = `${base}_${n++}`
  }
  return key
}

export async function catalogExists(type: CatalogType, id: string): Promise<boolean> {
  const args = { where: { id }, select: { id: true } }
  if (type === "organs") return !!(await prisma.organ.findUnique(args))
  if (type === "pathogens") return !!(await prisma.pathogen.findUnique(args))
  return !!(await prisma.examType.findUnique(args))
}

export async function deleteCatalog(type: CatalogType, id: string): Promise<void> {
  const args = { where: { id } }
  if (type === "organs") await prisma.organ.delete(args)
  else if (type === "pathogens") await prisma.pathogen.delete(args)
  else await prisma.examType.delete(args)
}

// Quantas vezes o item é referenciado (protocolos + amostras/análises). Bloqueia a exclusão.
export async function catalogUsage(type: CatalogType, id: string): Promise<number> {
  if (type === "organs") {
    const [p, s] = await Promise.all([
      prisma.researchProtocol.count({ where: { organId: id } }),
      prisma.sample.count({ where: { organId: id } }),
    ])
    return p + s
  }
  if (type === "pathogens") {
    const [p, a] = await Promise.all([
      prisma.researchProtocol.count({ where: { pathogenId: id } }),
      prisma.analysis.count({ where: { pathogenId: id } }),
    ])
    return p + a
  }
  const [p, a] = await Promise.all([
    prisma.researchProtocol.count({ where: { examTypeId: id } }),
    prisma.analysis.count({ where: { examTypeId: id } }),
  ])
  return p + a
}
