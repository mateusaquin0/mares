// MARES — Selects compartilhados do domínio Análises.
// Rastreio (parentAnalysisId = null) e confirmação (parentAnalysisId preenchido) vêm na mesma
// lista plana das grades; o cliente separa e aninha. As confirmações trazem o próprio
// patógeno/exame (para exibir a espécie) e as sequências. Ver docs/PLANO_CONFIRMACAO_SEQUENCIAMENTO.md.

import type { Prisma } from "@prisma/client"

import type { ResultValue } from "@/types/analysis"

// Uma linha da grade (rastreio ou confirmação) com o mínimo para exibir e aninhar.
export const analysisRowSelect = {
  id: true,
  sampleId: true,
  pathogenId: true,
  examTypeId: true,
  parentAnalysisId: true,
  result: true,
  measureValue: true,
  notes: true,
  pathogen: { select: { id: true, scientificName: true, name: true } },
  examType: { select: { id: true, name: true } },
  sequences: {
    select: {
      id: true,
      marker: true,
      accession: true,
      pctIdentity: true,
      consensus: true,
      platform: true,
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.AnalysisSelect

// Patógeno do protocolo, com táxon para sugerir espécies da mesma família na confirmação.
export const protocolPathogenSelect = {
  id: true,
  scientificName: true,
  name: true,
  taxonFamily: true,
  taxonRank: true,
  taxonId: true,
} satisfies Prisma.PathogenSelect

// ── Patch de uma célula da grade ─────────────────────────────────────────────
// Um lançamento tem três campos (resultado, medida, observação). O cliente manda APENAS os
// que o usuário editou: chave AUSENTE = "não altere", `null` = "limpe". Mandar os três a cada
// edição deixava um retrato de tela desatualizado reverter os outros dois — era assim que uma
// mudança gravada voltava ao valor antigo sozinha.

export type AnalysisValues = {
  result: ResultValue | null
  measureValue: number | null
  notes: string | null
}

export type AnalysisPatch = {
  result?: ResultValue | null
  measureValue?: number | null
  notes?: string | null
}

export const EMPTY_ANALYSIS: AnalysisValues = { result: null, measureValue: null, notes: null }

const ANALYSIS_FIELDS = ["result", "measureValue", "notes"] as const

// oldValue/newValue do AuditLog são colunas de texto.
export const analysisFieldText = (v: ResultValue | number | string | null) =>
  v == null ? null : String(v)

/** Estado resultante de aplicar `patch` sobre `current` (null = célula ainda sem lançamento). */
export function applyAnalysisPatch(
  current: AnalysisValues | null,
  patch: AnalysisPatch,
): AnalysisValues {
  const base = current ?? EMPTY_ANALYSIS
  return {
    result: patch.result !== undefined ? patch.result : base.result,
    measureValue: patch.measureValue !== undefined ? patch.measureValue : base.measureValue,
    notes: patch.notes !== undefined ? patch.notes : base.notes,
  }
}

/**
 * Célula sem dado nenhum. Uma análise "vazia" não é dado — e, mantida, bloquearia para sempre
 * a exclusão da amostra (sampleHasAnalyses). Por isso o lançamento nesse estado é REMOVIDO.
 */
export function isAnalysisEmpty(v: AnalysisValues): boolean {
  return v.result === null && v.measureValue === null && v.notes === null
}

/**
 * Funde a grade que chegou do servidor no mapa de células editável da aba de análises.
 *
 * `guards` guarda, por célula, o instante até o qual o estado LOCAL é soberano: Infinity
 * enquanto há save em voo, e o instante da conclusão depois dele. Uma resposta PEDIDA antes
 * dessa marca chega depois da escrita, mas o conteúdo dela é mais velho — aceitá-la revertia
 * na tela a célula recém-gravada, e o commit seguinte naquela linha regravava o valor antigo
 * no servidor. Para essas células o local manda, inclusive na AUSÊNCIA: lançamento removido
 * não pode ser ressuscitado por uma resposta velha que ainda o traz.
 */
export function mergeAnalysisCells<T>(
  fromServer: Record<string, T>,
  local: Record<string, T>,
  guards: ReadonlyMap<string, number>,
  requestedAt: number,
): Record<string, T> {
  const merged: Record<string, T> = { ...fromServer }
  for (const [k, guardedUntil] of guards) {
    if (guardedUntil <= requestedAt) continue
    if (local[k]) merged[k] = local[k]
    else delete merged[k]
  }
  return merged
}

/** Campos que mudam de fato: base do AuditLog e do "gravou ou não gravou". */
export function analysisChanges(
  current: AnalysisValues | null,
  next: AnalysisValues,
): { field: string; oldValue: string | null; newValue: string | null }[] {
  const base = current ?? EMPTY_ANALYSIS
  return ANALYSIS_FIELDS.filter(
    (f) => analysisFieldText(base[f]) !== analysisFieldText(next[f]),
  ).map((f) => ({
    field: f,
    oldValue: analysisFieldText(base[f]),
    newValue: analysisFieldText(next[f]),
  }))
}
