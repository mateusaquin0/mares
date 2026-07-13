// MARES — Acesso aos catálogos globais.
// Órgão/Exame: `name` JSON { pt, en }. Patógeno: pertence a um PathogenGroup e tem
// `scientificName` (grupos científicos) OU `name` JSON { pt, en } (grupos comuns).

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { CatalogType } from "@/schemas/catalog.schema"
import { pathogenSchema, examTypeSchema, nameI18nSchema } from "@/schemas/catalog.schema"
import { NotFoundError, ValidationError, ConflictError } from "@/lib/errors"
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
  taxonRank: string | null
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
  taxonRank: true,
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

// Táxon do patógeno (NCBI): família/ordem/rank/TaxId. Só faz sentido para grupos científicos.
export type PathogenTaxon = {
  taxonFamily: string | null
  taxonOrder: string | null
  taxonRank: string | null
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
      taxonRank: data.taxon.taxonRank,
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
      taxonRank: data.taxon.taxonRank,
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
      taxonRank: data.taxonRank?.trim().toLowerCase() || null,
      taxonId: data.taxonId ?? null,
    }
    return { groupId: group.id, scientificName: sci, name: null, taxon, keySource: sci }
  }
  const pt = data.namePt?.trim()
  const en = data.nameEn?.trim()
  if (!pt || !en)
    throw new ValidationError("Nome (PT e EN) é obrigatório", ERROR_CODES.catalogNameRequired)
  const emptyTaxon: PathogenTaxon = {
    taxonFamily: null,
    taxonOrder: null,
    taxonRank: null,
    taxonId: null,
  }
  return {
    groupId: group.id,
    scientificName: null,
    name: { pt, en },
    taxon: emptyTaxon,
    keySource: pt,
  }
}

// Regra de negócio: um patógeno de grupo científico só pode ser CRIADO a partir de uma seleção
// da base NCBI — isto é, com `taxonId` vinculado. Nome científico digitado livremente (sem
// vínculo) é recusado. Não se aplica a grupos de nome comum (scientificName nulo).
export function assertPathogenFromNcbi(scientificName: string | null, taxonId: number | null) {
  if (scientificName && taxonId == null) {
    throw new ValidationError(
      "Selecione o nome científico na base NCBI",
      ERROR_CODES.pathogenNcbiRequired,
    )
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

// ── Criação unificada (usada pela criação direta E pela aprovação de solicitação) ───────────
// Valida o corpo conforme o tipo e cria o item, atribuindo `createdById`. Converte a violação
// do índice único de nome (P2002) em ConflictError(catalogDuplicate) para ambos os chamadores.
export async function createCatalogItem(
  type: CatalogType,
  body: unknown,
  createdById: string,
): Promise<NamedRow | PathogenRow> {
  try {
    if (type === "pathogens") {
      const p = await resolvePathogen(body)
      assertPathogenFromNcbi(p.scientificName, p.taxon.taxonId)
      return await createPathogenEntry({
        key: await uniqueKey(type, p.keySource),
        groupId: p.groupId,
        scientificName: p.scientificName,
        name: p.name,
        taxon: p.taxon,
        createdById,
      })
    }
    if (type === "exam-types") {
      const data = examTypeSchema.parse(body)
      return await createNamed(
        type,
        await uniqueKey(type, data.namePt),
        { pt: data.namePt.trim(), en: data.nameEn.trim() },
        createdById,
        resolveMeasure(data),
      )
    }
    const data = nameI18nSchema.parse(body)
    return await createNamed(
      type,
      await uniqueKey(type, data.namePt),
      { pt: data.namePt.trim(), en: data.nameEn.trim() },
      createdById,
    )
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ConflictError("Já existe um item com esse nome", ERROR_CODES.catalogDuplicate)
    }
    throw e
  }
}

// ── Indicador de uso (só admin global): quantas pesquisas / grupos referenciam o item ───────
// Retorna apenas contagens de DISTINTOS (nunca ids) — privacidade por construção. Ver plano.
export type CatalogUsageBreakdown = { researches: number; orgs: number }

function fieldFor(type: CatalogType): "organId" | "pathogenId" | "examTypeId" {
  return type === "organs" ? "organId" : type === "pathogens" ? "pathogenId" : "examTypeId"
}

export async function catalogUsageBreakdown(
  type: CatalogType,
  id: string,
): Promise<CatalogUsageBreakdown> {
  const field = fieldFor(type)
  const researches = new Set<string>()
  const orgs = new Set<string>()

  // Protocolos (a org vem via research). Vale para os três tipos.
  const protocols = await prisma.researchProtocol.findMany({
    where: { [field]: id },
    select: { researchId: true, research: { select: { orgId: true } } },
  })
  for (const p of protocols) {
    researches.add(p.researchId)
    orgs.add(p.research.orgId)
  }

  if (type === "organs") {
    // Amostras referenciam o órgão e já trazem researchId + orgId denormalizados.
    const samples = await prisma.sample.findMany({
      where: { organId: id },
      select: { researchId: true, orgId: true },
    })
    for (const s of samples) {
      researches.add(s.researchId)
      orgs.add(s.orgId)
    }
  } else {
    // Patógeno / exame: análises → amostra (researchId + orgId).
    const analyses = await prisma.analysis.findMany({
      where: { [field]: id },
      select: { sample: { select: { researchId: true, orgId: true } } },
    })
    for (const a of analyses) {
      researches.add(a.sample.researchId)
      orgs.add(a.sample.orgId)
    }
  }

  return { researches: researches.size, orgs: orgs.size }
}

// ── Deduplicação (best-effort, p/ rótulo de rejeição) ───────────────────────────────────────
// Devolve o id de um item existente cujo nome normalizado (sem acento/caixa) coincide com o
// payload, ou null. Dataset pequeno → filtra em memória. Espelha os índices únicos do banco.
function readName(v: Prisma.JsonValue | null): { pt: string; en: string } {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    return { pt: typeof o.pt === "string" ? o.pt : "", en: typeof o.en === "string" ? o.en : "" }
  }
  return { pt: "", en: "" }
}

export async function findDuplicate(type: CatalogType, body: unknown): Promise<string | null> {
  if (type === "pathogens") {
    const p = await resolvePathogen(body)
    const rows = await listPathogens()
    const sci = p.scientificName ? slugify(p.scientificName) : null
    const pt = p.name?.pt ? slugify(p.name.pt) : null
    const en = p.name?.en ? slugify(p.name.en) : null
    const match = rows.find((r) => {
      if (sci && r.scientificName && slugify(r.scientificName) === sci) return true
      const n = readName(r.name)
      if (pt && n.pt && slugify(n.pt) === pt) return true
      if (en && n.en && slugify(n.en) === en) return true
      return false
    })
    return match?.id ?? null
  }
  const data = type === "exam-types" ? examTypeSchema.parse(body) : nameI18nSchema.parse(body)
  const pt = slugify(data.namePt)
  const en = slugify(data.nameEn)
  const rows = await listNamed(type)
  const match = rows.find((r) => {
    const n = readName(r.name)
    return (n.pt && slugify(n.pt) === pt) || (n.en && slugify(n.en) === en)
  })
  return match?.id ?? null
}
