// MARES — Hook de dados de Amostras (react-query sobre samplesService).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { samplesService, type SamplePayload } from "@/services/samples"
import { animalKeys } from "@/hooks/use-animals"

export const sampleKeys = {
  byAnimal: (animalId: string) => ["samples", animalId] as const,
}

// Amostras mudam as colunas da grade de análises E o contador de amostras da aba
// (animal._count.samples, vindo de animalKeys.detail) — invalida os três.
function invalidateSamples(qc: ReturnType<typeof useQueryClient>, animalId: string) {
  qc.invalidateQueries({ queryKey: sampleKeys.byAnimal(animalId) })
  qc.invalidateQueries({ queryKey: animalKeys.grid(animalId) })
  qc.invalidateQueries({ queryKey: animalKeys.detail(animalId) })
}

export function useSamples(animalId: string) {
  return useQuery({
    queryKey: sampleKeys.byAnimal(animalId),
    queryFn: () => samplesService.listByAnimal(animalId),
  })
}

// ── Mutações ─────────────────────────────────────────────────────────────────

export function useCreateSample(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SamplePayload) => samplesService.create(animalId, data),
    onSuccess: () => invalidateSamples(qc, animalId),
  })
}

export function useUpdateSample(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; data: SamplePayload }) =>
      samplesService.update(vars.id, vars.data),
    onSuccess: () => invalidateSamples(qc, animalId),
  })
}

export function useDeleteSample(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => samplesService.remove(id),
    onSuccess: () => invalidateSamples(qc, animalId),
  })
}
