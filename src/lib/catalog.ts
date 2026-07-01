// MARES — Acesso aos catálogos globais (Organ / Pathogen / ExamType).
// Órgão/Exame: `name` é JSON { pt, en }. Patógeno: `name` é texto (científico) + `group` JSON.
// A leitura é unificada em CatalogRow; a escrita é específica por formato.

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { CatalogType } from "@/schemas/catalog.schema"

export type I18n = { pt: string; en: string }

export type CatalogRow = {
  id: string
  key: string
  name: Prisma.JsonValue // { pt, en } (órgão/exame) ou string (patógeno)
  group: Prisma.JsonValue | null
}

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
  if (type === "pathogens") {
    const rows = await prisma.pathogen.findMany({
      orderBy: { name: "asc" },
      select: { id: true, key: true, name: true, group: true },
    })
    return rows.map((r) => ({ id: r.id, key: r.key, name: r.name, group: r.group }))
  }
  const select = { id: true, key: true, name: true }
  const rows =
    type === "organs"
      ? await prisma.organ.findMany({ orderBy: { key: "asc" }, select })
      : await prisma.examType.findMany({ orderBy: { key: "asc" }, select })
  return rows.map((r) => ({ id: r.id, key: r.key, name: r.name, group: null }))
}

export async function findCatalog(type: CatalogType, id: string): Promise<CatalogRow | null> {
  if (type === "pathogens") {
    const r = await prisma.pathogen.findUnique({
      where: { id },
      select: { id: true, key: true, name: true, group: true },
    })
    return r ? { id: r.id, key: r.key, name: r.name, group: r.group } : null
  }
  const select = { id: true, key: true, name: true }
  const r =
    type === "organs"
      ? await prisma.organ.findUnique({ where: { id }, select })
      : await prisma.examType.findUnique({ where: { id }, select })
  return r ? { id: r.id, key: r.key, name: r.name, group: null } : null
}

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

// ── Escrita ────────────────────────────────────────────────────────────────

export async function createNamed(
  type: "organs" | "exam-types",
  key: string,
  name: I18n
): Promise<CatalogRow> {
  const data = { key, name }
  const select = { id: true, key: true, name: true }
  const r =
    type === "organs"
      ? await prisma.organ.create({ data, select })
      : await prisma.examType.create({ data, select })
  return { id: r.id, key: r.key, name: r.name, group: null }
}

export async function updateNamed(
  type: "organs" | "exam-types",
  id: string,
  name: I18n
): Promise<CatalogRow> {
  const data = { name }
  const select = { id: true, key: true, name: true }
  const r =
    type === "organs"
      ? await prisma.organ.update({ where: { id }, data, select })
      : await prisma.examType.update({ where: { id }, data, select })
  return { id: r.id, key: r.key, name: r.name, group: null }
}

export async function createPathogen(
  key: string,
  name: string,
  group: I18n | null
): Promise<CatalogRow> {
  return prisma.pathogen.create({
    data: { key, name, group: group ?? undefined },
    select: { id: true, key: true, name: true, group: true },
  })
}

export async function updatePathogen(
  id: string,
  name: string,
  group: I18n | null
): Promise<CatalogRow> {
  return prisma.pathogen.update({
    where: { id },
    data: { name, group: group ?? Prisma.DbNull },
    select: { id: true, key: true, name: true, group: true },
  })
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
