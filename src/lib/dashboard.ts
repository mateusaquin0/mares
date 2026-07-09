// MARES — Agregações do Dashboard (Fase 5). Calcula, no servidor, os números e séries
// que alimentam os gráficos e o heatmap, respeitando os filtros globais (pesquisa e período).
// Tudo é escopado à organização ativa (orgId) — o dashboard nunca cruza organizações.

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { txt, type I18nText } from "@/lib/catalog-i18n"

export type DashboardFilters = {
  researchId?: string
  // Escopo de visibilidade por pesquisa (undefined = admin, sem restrição). Quando presente,
  // o dashboard agrega apenas os animais cuja pesquisa primária está no conjunto.
  researchIds?: string[]
  // Patógeno: quando presente, restringe TODO o dashboard aos dados daquele patógeno —
  // população = animais com ≥1 análise do patógeno; métricas de análise filtradas por ele.
  pathogenId?: string
  from?: string // ISO date (YYYY-MM-DD), inclusivo
  to?: string // ISO date (YYYY-MM-DD), inclusivo
}

export type DashboardData = {
  totals: {
    animals: number
    samples: number
    testedAnimals: number // animais com ≥1 análise com resultado (A1)
    testedSamples: number // amostras com ≥1 análise com resultado (A2)
    analyses: number
    positive: number
    positiveAnimals: number // animais com ≥1 análise POSITIVO (A2)
    positiveSamples: number // amostras com ≥1 análise POSITIVO (A2)
    positivity: number // padrão: por análise
    positivityByAnimal: number // A2
    positivityBySample: number // A2
  }
  species: { name: string; count: number }[]
  positivityByExam: { label: string; total: number; positives: number; pct: number }[]
  timeline: { month: string; count: number }[] // YYYY-MM → nº de encalhes (por eventDate)
  heat: [number, number][] // [lat, lon] dos animais com coordenadas
}

// Taxa de positividade percentual, com guarda de divisão por zero (denominador 0 → 0).
// Compartilhada pelos três modos de cálculo (por análise, animal, amostra — A2).
export function positivityRate(positives: number, denominator: number): number {
  return denominator > 0 ? (positives / denominator) * 100 : 0
}

// Monta o filtro Prisma dos animais a partir do escopo (org) + filtros globais.
function animalWhere(orgId: string, f: DashboardFilters): Prisma.AnimalWhereInput {
  // Filtro por pesquisa: o filtro explícito (dropdown) tem prioridade; senão, o escopo de
  // visibilidade do pesquisador (researchIds). Admin sem escopo → todas as pesquisas da org.
  const researchIdFilter = f.researchId
    ? { id: f.researchId }
    : f.researchIds
      ? { id: { in: f.researchIds } }
      : {}
  const where: Prisma.AnimalWhereInput = {
    research: { orgId, ...researchIdFilter },
  }
  if (f.from || f.to) {
    where.eventDate = {
      ...(f.from ? { gte: new Date(f.from) } : {}),
      // `to` inclusivo: até o fim do dia informado.
      ...(f.to ? { lte: new Date(`${f.to}T23:59:59.999Z`) } : {}),
    }
  }
  // Filtro por patógeno: restringe a população aos animais com ≥1 análise do patógeno.
  // (As métricas de análise recebem o mesmo filtro no nível da análise — ver getDashboardData.)
  if (f.pathogenId) {
    where.samples = { some: { analyses: { some: { pathogenId: f.pathogenId } } } }
  }
  return where
}

export async function getDashboardData(
  orgId: string,
  locale: string,
  filters: DashboardFilters = {},
): Promise<DashboardData> {
  const aWhere = animalWhere(orgId, filters)
  const analysisScope = { sample: { animal: aWhere } }
  // Restrição por patógeno aplicada no nível da análise (numeradores/denominadores por
  // análise, e o `some` interno das contagens por animal/amostra).
  const pWhere = filters.pathogenId ? { pathogenId: filters.pathogenId } : {}

  const [
    animals,
    samples,
    testedAnimals,
    testedSamples,
    analyses,
    positive,
    positiveAnimals,
    positiveSamples,
    speciesGroups,
    examTotalsRaw,
    examPositivesRaw,
    eventDates,
    coords,
  ] = await Promise.all([
    prisma.animal.count({ where: aWhere }),
    prisma.sample.count({ where: { animal: aWhere } }),
    // Animais/amostras "testados" = com ≥1 análise com resultado preenchido (A1/A2).
    prisma.animal.count({
      where: {
        ...aWhere,
        samples: { some: { analyses: { some: { result: { not: null }, ...pWhere } } } },
      },
    }),
    prisma.sample.count({
      where: { animal: aWhere, analyses: { some: { result: { not: null }, ...pWhere } } },
    }),
    prisma.analysis.count({ where: { result: { not: null }, ...pWhere, ...analysisScope } }),
    prisma.analysis.count({ where: { result: "POSITIVO", ...pWhere, ...analysisScope } }),
    // Animais/amostras com ≥1 análise POSITIVO (numeradores dos modos por animal/amostra, A2).
    prisma.animal.count({
      where: {
        ...aWhere,
        samples: { some: { analyses: { some: { result: "POSITIVO", ...pWhere } } } },
      },
    }),
    prisma.sample.count({
      where: { animal: aWhere, analyses: { some: { result: "POSITIVO", ...pWhere } } },
    }),
    prisma.animal.groupBy({
      by: ["species"],
      where: aWhere,
      _count: { _all: true },
      orderBy: { _count: { species: "desc" } },
      take: 8,
    }),
    prisma.analysis.groupBy({
      by: ["examTypeId"],
      where: { result: { not: null }, ...pWhere, ...analysisScope },
      _count: { _all: true },
    }),
    prisma.analysis.groupBy({
      by: ["examTypeId"],
      where: { result: "POSITIVO", ...pWhere, ...analysisScope },
      _count: { _all: true },
    }),
    prisma.animal.findMany({
      where: { ...aWhere, eventDate: { ...(aWhere.eventDate as object), not: null } },
      select: { eventDate: true },
    }),
    prisma.animal.findMany({
      where: { ...aWhere, strandingLat: { not: null }, strandingLon: { not: null } },
      select: { strandingLat: true, strandingLon: true },
    }),
  ])

  // Espécies mais registradas. Espécie nula (indeterminada) recebe rótulo localizado.
  const undetermined = locale === "en" ? "Undetermined" : "Indeterminado"
  const species = speciesGroups.map((s) => ({
    name: s.species ?? undetermined,
    count: s._count._all,
  }))

  // Positividade por exame (top 6 por volume de resultados).
  const positivesById = new Map(examPositivesRaw.map((e) => [e.examTypeId, e._count._all]))
  const examStats = examTotalsRaw
    .map((e) => ({
      id: e.examTypeId,
      total: e._count._all,
      positives: positivesById.get(e.examTypeId) ?? 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
  const examTypes = examStats.length
    ? await prisma.examType.findMany({
        where: { id: { in: examStats.map((e) => e.id) } },
        select: { id: true, name: true },
      })
    : []
  const examNameById = new Map(examTypes.map((e) => [e.id, e.name as I18nText]))
  const positivityByExam = examStats.map((e) => ({
    label: txt(locale, examNameById.get(e.id)),
    total: e.total,
    positives: e.positives,
    pct: e.total > 0 ? (e.positives / e.total) * 100 : 0,
  }))

  // Linha do tempo: encalhes por mês (YYYY-MM), ordenada cronologicamente.
  const byMonth = new Map<string, number>()
  for (const a of eventDates) {
    if (!a.eventDate) continue
    const key = a.eventDate.toISOString().slice(0, 7)
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1)
  }
  const timeline = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }))

  const heat = coords.map(
    (c) => [c.strandingLat as number, c.strandingLon as number] as [number, number],
  )

  return {
    totals: {
      animals,
      samples,
      testedAnimals,
      testedSamples,
      analyses,
      positive,
      positiveAnimals,
      positiveSamples,
      positivity: positivityRate(positive, analyses),
      positivityByAnimal: positivityRate(positiveAnimals, testedAnimals),
      positivityBySample: positivityRate(positiveSamples, testedSamples),
    },
    species,
    positivityByExam,
    timeline,
    heat,
  }
}
