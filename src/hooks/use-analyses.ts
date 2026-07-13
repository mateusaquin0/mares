// MARES — Hooks de mutação de Análises (react-query sobre analysesService).
// A grade de análises é lida por useAnimalGrid; o upsert de célula usa estado otimista local.
// As confirmações de espécie invalidam a grade para reidratar os filhos.

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { animalKeys } from "@/hooks/use-animals"
import { analysesService, type AnalysisUpsert, type ConfirmationPayload } from "@/services/analyses"

export function useUpsertAnalysis() {
  return useMutation({
    mutationFn: (data: AnalysisUpsert) => analysesService.upsert(data),
  })
}

// Cria (childId null) ou edita (childId presente) uma confirmação de espécie.
export function useSaveConfirmation(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { parentId: string; childId: string | null; data: ConfirmationPayload }) =>
      vars.childId
        ? analysesService.updateConfirmation(vars.childId, vars.data)
        : analysesService.createConfirmation(vars.parentId, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: animalKeys.grid(animalId) }),
  })
}

export function useDeleteConfirmation(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (childId: string) => analysesService.deleteConfirmation(childId),
    onSuccess: () => qc.invalidateQueries({ queryKey: animalKeys.grid(animalId) }),
  })
}
