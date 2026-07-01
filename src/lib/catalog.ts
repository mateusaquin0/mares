// MARES — Acesso genérico aos catálogos globais (Organ / Pathogen / ExamType).
// As três tabelas têm o mesmo formato (key + name_pt/en + group_pt/en), então centralizamos
// aqui as operações, mantendo chamadas concretas por tabela (type-safe).

import { prisma } from "@/lib/prisma"
import type { CatalogType } from "@/schemas/catalog.schema"

export type CatalogRow = {
  id: string
  key: string
  namePt: string
  nameEn: string
  groupPt: string | null
  groupEn: string | null
}

export type CatalogData = {
  key: string
  namePt: string
  nameEn: string
  groupPt: string | null
  groupEn: string | null
}

const SELECT = {
  id: true,
  key: true,
  namePt: true,
  nameEn: true,
  groupPt: true,
  groupEn: true,
} as const

// Gera um slug estável a partir do nome (usado como `key`).
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export async function listCatalog(type: CatalogType): Promise<CatalogRow[]> {
  const args = { orderBy: { namePt: "asc" as const }, select: SELECT }
  if (type === "organs") return prisma.organ.findMany(args)
  if (type === "pathogens") return prisma.pathogen.findMany(args)
  return prisma.examType.findMany(args)
}

export async function findCatalog(type: CatalogType, id: string): Promise<CatalogRow | null> {
  const args = { where: { id }, select: SELECT }
  if (type === "organs") return prisma.organ.findUnique(args)
  if (type === "pathogens") return prisma.pathogen.findUnique(args)
  return prisma.examType.findUnique(args)
}

export async function keyExists(type: CatalogType, key: string): Promise<boolean> {
  const args = { where: { key }, select: { id: true } }
  if (type === "organs") return !!(await prisma.organ.findUnique(args))
  if (type === "pathogens") return !!(await prisma.pathogen.findUnique(args))
  return !!(await prisma.examType.findUnique(args))
}

// Gera um key único a partir do nome (sufixo numérico em caso de colisão).
export async function uniqueKey(type: CatalogType, name: string): Promise<string> {
  const base = slugify(name) || "item"
  let key = base
  let n = 2
  while (await keyExists(type, key)) {
    key = `${base}_${n++}`
  }
  return key
}

export async function createCatalog(type: CatalogType, data: CatalogData): Promise<CatalogRow> {
  if (type === "organs") return prisma.organ.create({ data, select: SELECT })
  if (type === "pathogens") return prisma.pathogen.create({ data, select: SELECT })
  return prisma.examType.create({ data, select: SELECT })
}

export async function updateCatalog(
  type: CatalogType,
  id: string,
  data: Partial<Omit<CatalogData, "key">>
): Promise<CatalogRow> {
  const args = { where: { id }, data, select: SELECT }
  if (type === "organs") return prisma.organ.update(args)
  if (type === "pathogens") return prisma.pathogen.update(args)
  return prisma.examType.update(args)
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
