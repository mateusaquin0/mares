// MARES — Hook de mutação de Análises (react-query sobre analysesService).
// A grade de análises é lida por useAnimalGrid; aqui só o upsert de uma célula.

import { useMutation } from "@tanstack/react-query"

import { analysesService, type AnalysisUpsert } from "@/services/analyses"

export function useUpsertAnalysis() {
  return useMutation({
    mutationFn: (data: AnalysisUpsert) => analysesService.upsert(data),
  })
}
