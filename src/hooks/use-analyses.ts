// MARES — Hooks de mutação de Análises (react-query sobre analysesService).
// A grade de análises é lida por useAnimalGrid; o upsert de célula usa estado otimista local.
// As confirmações de espécie invalidam a grade para reidratar os filhos.

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query"

import { animalKeys } from "@/hooks/use-animals"
import { dashboardKeys } from "@/hooks/use-dashboard"
import { analysesService, type AnalysisUpsert, type ConfirmationPayload } from "@/services/analyses"

// Um resultado lançado muda a grade de resultados da pesquisa e a positividade do dashboard.
// Só marca como obsoleto: essas telas não estão montadas durante a edição e recarregam ao abrir.
function markResultViewsStale(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: dashboardKeys.all, refetchType: "none" })
  qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === "research" && q.queryKey[2] === "results",
    refetchType: "none",
  })
}

export function useUpsertAnalysis(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AnalysisUpsert) => analysesService.upsert(data),
    // `refetchType: "none"`: marca a grade como obsoleta sem buscá-la agora. Um GET por célula
    // salva seria desperdício ao preencher uma coluna inteira; a próxima montagem da aba
    // recarrega. A grade que chega é FUNDIDA no estado local (não o substitui), então ela não
    // atropela edição em curso — ver o useEffect de sincronização em analyses-tab.tsx.
    onSuccess: () => {
      markResultViewsStale(qc)
      return qc.invalidateQueries({ queryKey: animalKeys.grid(animalId), refetchType: "none" })
    },
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
    onSuccess: () => {
      markResultViewsStale(qc)
      return qc.invalidateQueries({ queryKey: animalKeys.grid(animalId) })
    },
  })
}

export function useDeleteConfirmation(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (childId: string) => analysesService.deleteConfirmation(childId),
    onSuccess: () => {
      markResultViewsStale(qc)
      return qc.invalidateQueries({ queryKey: animalKeys.grid(animalId) })
    },
  })
}
