// MARES — Hook de dados de Amostras (react-query sobre samplesService).

import { useQuery } from "@tanstack/react-query"

import { samplesService } from "@/services/samples"

export const sampleKeys = {
  byAnimal: (animalId: string) => ["samples", animalId] as const,
}

export function useSamples(animalId: string) {
  return useQuery({
    queryKey: sampleKeys.byAnimal(animalId),
    queryFn: () => samplesService.listByAnimal(animalId),
  })
}
