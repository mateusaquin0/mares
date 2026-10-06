// MARES — Hook de dados da biometria (react-query sobre biometryService).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { biometryService, type SaveBiometryPayload } from "@/services/biometry"
import { animalKeys } from "@/hooks/use-animals"

export const biometryKeys = {
  byAnimal: (animalId: string) => ["biometry", animalId] as const,
}

export function useBiometry(animalId: string, enabled = true) {
  return useQuery({
    queryKey: biometryKeys.byAnimal(animalId),
    queryFn: () => biometryService.get(animalId),
    enabled,
  })
}

export function useSaveBiometry(animalId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SaveBiometryPayload) => biometryService.save(animalId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: biometryKeys.byAnimal(animalId) })
      // O peso vive em `Animal.necropsyWeightKg`, que aparece na aba de encalhe e no cabeçalho
      // — salvar a biometria pode tê-lo mudado.
      qc.invalidateQueries({ queryKey: animalKeys.detail(animalId) })
    },
  })
}

// Prévia da importação: não invalida nada porque não grava. Quem persiste é o save, depois da
// conferência.
export function useSimbaBiometry(animalId: string) {
  return useMutation({ mutationFn: () => biometryService.fromSimba(animalId) })
}
