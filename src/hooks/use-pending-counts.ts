// MARES — Hook das contagens de pendências (bolinha do menu lateral).
// Atualização: ao focar a aba + polling de fundo a cada 5 min + invalidação disparada
// pelas mutations que resolvem pendências (aprovar acesso, triar feedback, revisar
// glossário) — ver `pendingCountsKeys.all`.

import { useQuery } from "@tanstack/react-query"

import { pendingCountsService } from "@/services/pending-counts"

export const pendingCountsKeys = {
  all: ["pending-counts"] as const,
}

export function usePendingCounts() {
  return useQuery({
    queryKey: pendingCountsKeys.all,
    queryFn: () => pendingCountsService.get(),
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000,
  })
}
