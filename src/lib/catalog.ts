// MARES — Acesso aos catálogos globais.
// Órgão/Exame: `name` JSON { pt, en }. Patógeno: pertence a um PathogenGroup e tem
// `scientificName` (grupos científicos) OU `name` JSON { pt, en } (grupos comuns).

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { CatalogType } from "@/schemas/catalog.schema"
import { pathogenSchema } from "@/schemas/catalog.schema"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { slugify } from "@/lib/slug"

export type I18n = { pt: string; en: string }

// ── Órgão / Exame (name JSON) ───────────────────────────────────────────────

export type NamedType = "organs" | "exam-types"
export type NamedRow = {
  id: string
  key: string
  name: Prisma.JsonValue
  createdById: string | null
  // Só faz sentido para exam-types; null para órgãos. Ver docs/BANCO_DE_DADOS.md.
  measureLabel: Prisma.JsonValue | null
  measureUnit: string | null
  inUse: boolean
}

// Medida quantitativa de um tipo de exame (Ct, Título...). label null = exame sem medida.
export type Measure = { label: I18n | null; unit: string | null }

// Deriva a Measure do corpo do formulário: só há rótulo se PT e EN vierem preenchidos.
export function resolveMeasure(data: {
  measurePt?: string
  measureEn?: string
  measureUnit?: string
}): Measure {
  const pt = data.measurePt?.trim()
  const en = data.measureEn?.trim()
  const label = pt && en ? { pt, en } : null
  return { label, unit: label ? data.measureUnit?.trim() || null : null }
}

const namedSelect = { id: true, key: true, name: true, createdById: true }
const examTypeSelect = { ...namedSelect, measureLabel: true, measureUnit: true }

// Normaliza o retorno: órgãos não têm medida (null); exames trazem measureLabel/measureUnit.
function toNamedRow(
  r: {
    id: string
    key: string
    name: Prisma.JsonValue
    createdById: string | null
    measureLabel?: Prisma.JsonValue | null
    measureUnit?: string | null
  },
  inUse: boolean,
): NamedRow {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    createdById: r.createdById,
    measureLabel: r.measureLabel ?? null,
    measureUnit: r.measureUnit ?? null,
    inUse,
  }
}

// Converte a Measure em campos gravaveis no Prisma (JSON null quando sem rótulo).
function measureData(measure?: Measure) {
  return {
    measureLabel: measure?.label ? measure.label : Prisma.DbNull,
    measureUnit: measure?.unit ?? null,
  }
}

export async function listNamed(type: NamedType): Promise<NamedRow[]> {
  const rows =
    type === "organs"
      ? await prisma.organ.findMany({ orderBy: { key: "asc" }, select: namedSelect })
      : await prisma.examType.findMany({ orderBy: { key: "asc" }, select: examTypeSelect })
  const used = await catalogUsedIds(type)
  return rows.map((r) => toNamedRow(r, used.has(r.id)))
}

export async function createNamed(
  type: NamedType,
  key: string,
  name: I18n,
  createdById: string,
  measure?: Measure,
): Promise<NamedRow> {
  const row =
    type === "organs"
      ? await prisma.organ.create({ data: { key, name, createdById }, select: namedSelect })
      : await prisma.examType.create({
          data: { key, name, createdById, ...measureData(measure) },
          select: examTypeSelect,
        })
  return toNamedRow(row, false)
}

export async function updateNamed(
  type: NamedType,
  id: string,
  name: I18n,
  measure?: Measure,
): Promise<NamedRow> {
  const row =
    type === "organs"
      ? await prisma.organ.update({ where: { id }, data: { name }, select: namedSelect })
      : await prisma.examType.update({
          where: { id },
          data: { name, ...measureData(measure) },
          select: examTypeSelect,
        })
  return toNamedRow(row, (await catalogUsage(type, id)) > 0)
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
  taxonFamily: string | null
  taxonOrder: string | null
  taxonId: number | null
  createdById: string | null
  group: PathogenGroupRow
  inUse: boolean
}

const pathogenSelect = {
  id: true,
  key: true,
  scientificName: true,
  name: true,
  taxonFamily: true,
  taxonOrder: true,
  taxonId: true,
  createdById: true,
  group: { select: { id: true, key: true, name: true, usesScientificName: true } },
} satisfies Prisma.PathogenSelect

export async function listPathogenGroups(): Promise<PathogenGroupRow[]> {
  return prisma.pathogenGroup.findMany({
    orderBy: { key: "asc" },
    select: { id: true, key: true, name: true, usesScientificName: true },
  })
}

export async function findPathogenGroup(
  id: string,
): Promise<{ id: string; usesScientificName: boolean } | null> {
  return prisma.pathogenGroup.findUnique({
    where: { id },
    select: { id: true, usesScientificName: true },
  })
}

export async function listPathogens(): Promise<PathogenRow[]> {
  const rows = await prisma.pathogen.findMany({
    orderBy: [{ group: { key: "asc" } }, { scientificName: "asc" }],
    select: pathogenSelect,
  })
  const used = await catalogUsedIds("pathogens")
  return rows.map((r) => ({ ...r, inUse: used.has(r.id) }))
}

// Táxon do patógeno (NCBI): família/ordem/TaxId. Só faz sentido para grupos científicos.
export type PathogenTaxon = {
  taxonFamily: string | null
  taxonOrder: string | null
  taxonId: number | null
}

export async function createPathogenEntry(data: {
  key: string
  groupId: string
  scientificName: string | null
  name: I18n | null
  taxon: PathogenTaxon
  createdById: string
}): Promise<PathogenRow> {
  const row = await prisma.pathogen.create({
    data: {
      key: data.key,
      groupId: data.groupId,
      scientificName: data.scientificName,
      name: data.name ?? Prisma.DbNull,
      taxonFamily: data.taxon.taxonFamily,
      taxonOrder: data.taxon.taxonOrder,
      taxonId: data.taxon.taxonId,
      createdById: data.createdById,
    },
    select: pathogenSelect,
  })
  return { ...row, inUse: false }
}

export async function updatePathogenEntry(
  id: string,
  data: { groupId: string; scientificName: string | null; name: I18n | null; taxon: PathogenTaxon },
): Promise<PathogenRow> {
  const row = await prisma.pathogen.update({
    where: { id },
    data: {
      groupId: data.groupId,
      scientificName: data.scientificName,
      name: data.name ?? Prisma.DbNull,
      taxonFamily: data.taxon.taxonFamily,
      taxonOrder: data.taxon.taxonOrder,
      taxonId: data.taxon.taxonId,
    },
    select: pathogenSelect,
  })
  const [p, a] = await Promise.all([
    prisma.researchProtocol.count({ where: { pathogenId: id } }),
    prisma.analysis.count({ where: { pathogenId: id } }),
  ])
  return { ...row, inUse: p + a > 0 }
}

// Valida o corpo do patógeno conforme o grupo (científico exige scientificName; comum exige
// namePt + nameEn). Retorna os dados normalizados + a fonte do `key`.
export async function resolvePathogen(body: unknown): Promise<{
  groupId: string
  scientificName: string | null
  name: I18n | null
  taxon: PathogenTaxon
  keySource: string
}> {
  const data = pathogenSchema.parse(body)
  const group = await findPathogenGroup(data.groupId)
  if (!group) throw new NotFoundError("Grupo não encontrado", ERROR_CODES.catalogNotFound)

  if (group.usesScientificName) {
    const sci = data.scientificName?.trim()
    if (!sci)
      throw new ValidationError("Nome científico é obrigatório", ERROR_CODES.catalogNameRequired)
    const taxon: PathogenTaxon = {
      taxonFamily: data.taxonFamily?.trim() || null,
      taxonOrder: data.taxonOrder?.trim() || null,
      taxonId: data.taxonId ?? null,
    }
    return { groupId: group.id, scientificName: sci, name: null, taxon, keySource: sci }
  }
  const pt = data.namePt?.trim()
  const en = data.nameEn?.trim()
  if (!pt || !en)
    throw new ValidationError("Nome (PT e EN) é obrigatório", ERROR_CODES.catalogNameRequired)
  const emptyTaxon: PathogenTaxon = { taxonFamily: null, taxonOrder: null, taxonId: null }
  return {
    groupId: group.id,
    scientificName: null,
    name: { pt, en },
    taxon: emptyTaxon,
    keySource: pt,
  }
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

// Conjunto de ids de um tipo que já estão em uso (protocolos + amostras/análises).
// Usado para marcar `inUse` na listagem sem uma consulta por linha.
export async function catalogUsedIds(type: CatalogType): Promise<Set<string>> {
  if (type === "organs") {
    const [p, s] = await Promise.all([
      prisma.researchProtocol.findMany({ distinct: ["organId"], select: { organId: true } }),
      prisma.sample.findMany({ distinct: ["organId"], select: { organId: true } }),
    ])
    return new Set([...p.map((x) => x.organId), ...s.map((x) => x.organId)])
  }
  if (type === "pathogens") {
    const [p, a] = await Promise.all([
      prisma.researchProtocol.findMany({ distinct: ["pathogenId"], select: { pathogenId: true } }),
      prisma.analysis.findMany({ distinct: ["pathogenId"], select: { pathogenId: true } }),
    ])
    return new Set([...p.map((x) => x.pathogenId), ...a.map((x) => x.pathogenId)])
  }
  const [p, a] = await Promise.all([
    prisma.researchProtocol.findMany({ distinct: ["examTypeId"], select: { examTypeId: true } }),
    prisma.analysis.findMany({ distinct: ["examTypeId"], select: { examTypeId: true } }),
  ])
  return new Set([...p.map((x) => x.examTypeId), ...a.map((x) => x.examTypeId)])
}

/** Autor do item (para checagem de permissão). null = existe sem autor; undefined = não existe. */
export async function catalogCreatedBy(
  type: CatalogType,
  id: string,
): Promise<{ createdById: string | null } | null> {
  const args = { where: { id }, select: { createdById: true } }
  if (type === "organs") return prisma.organ.findUnique(args)
  if (type === "pathogens") return prisma.pathogen.findUnique(args)
  return prisma.examType.findUnique(args)
}

/** Regra de edição/exclusão: admin global sempre; senão, o criador enquanto não usado. */
export function canModifyCatalog(opts: {
  isSystemAdmin: boolean
  createdById: string | null
  userId: string
  usage: number
}): boolean {
  if (opts.isSystemAdmin) return true
  return !!opts.createdById && opts.createdById === opts.userId && opts.usage === 0
}
