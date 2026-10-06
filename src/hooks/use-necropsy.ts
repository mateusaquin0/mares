// MARES — Hook de dados do laudo anatomopatológico (react-query sobre necropsyService).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  necropsyService,
  type GrossFindingPayload,
  type HistopathologyPayload,
  type ScreeningPayload,
  type SystemExamPayload,
} from "@/services/necropsy"
import type { NecropsyReport } from "@/types/necropsy"
export const necropsyKeys = {
  byAnimal: (animalId: string) => ["necropsy", animalId] as const,
}

// Toda mutação recarrega o laudo inteiro: as três entidades aparecem na MESMA tela, e uma
// linha nova muda contadores (progresso, nº de achados) espalhados por ela.
function invalidate(qc: ReturnType<typeof useQueryClient>, animalId: string) {
  qc.invalidateQueries({ queryKey: necropsyKeys.byAnimal(animalId) })
}

export function useNecropsy(animalId: string, enabled = true) {
  return useQuery({
    queryKey: necropsyKeys.byAnimal(animalId),
    queryFn: () => necropsyService.get(animalId),
    enabled,
  })
}

// ── Mutações ─────────────────────────────────────────────────────────────────

export function useSetNecropsyScreening(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ScreeningPayload) => necropsyService.setScreening(animalId, data),
    // A resposta do PUT entra no cache ANTES da invalidação: a seção de triagem volta a
    // seguir o servidor assim que a gravação termina, e sem isso ela leria o laudo antigo
    // no intervalo até o refetch chegar — o valor recém-clicado piscava de volta.
    onSuccess: (screening) => {
      qc.setQueryData(necropsyKeys.byAnimal(animalId), (old?: NecropsyReport) =>
        old ? { ...old, screening } : old,
      )
      invalidate(qc, animalId)
    },
  })
}

export function useSetNecropsySystem(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SystemExamPayload) => necropsyService.setSystem(animalId, data),
    onSuccess: () => invalidate(qc, animalId),
  })
}

export function useCreateGrossFinding(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { systemId: string; data: GrossFindingPayload }) =>
      necropsyService.createFinding(animalId, vars.systemId, vars.data),
    onSuccess: () => invalidate(qc, animalId),
  })
}

// Tira o sistema do LAUDO (o catálogo continua intacto).
export function useRemoveNecropsySystem(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (examId: string) => necropsyService.removeSystem(examId),
    onSuccess: () => invalidate(qc, animalId),
  })
}

export function useUpdateGrossFinding(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; data: GrossFindingPayload }) =>
      necropsyService.updateFinding(vars.id, vars.data),
    onSuccess: () => invalidate(qc, animalId),
  })
}

export function useDeleteGrossFinding(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => necropsyService.removeFinding(id),
    onSuccess: () => invalidate(qc, animalId),
  })
}

export function useCreateHistopathology(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: HistopathologyPayload) => necropsyService.createHisto(animalId, data),
    onSuccess: () => invalidate(qc, animalId),
  })
}

export function useUpdateHistopathology(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; data: HistopathologyPayload }) =>
      necropsyService.updateHisto(vars.id, vars.data),
    onSuccess: () => invalidate(qc, animalId),
  })
}

export function useDeleteHistopathology(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => necropsyService.removeHisto(id),
    onSuccess: () => invalidate(qc, animalId),
  })
}
