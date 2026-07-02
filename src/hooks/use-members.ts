// MARES — Hook de dados de Membros de organização (react-query).

import { useQuery } from "@tanstack/react-query"

import { organizationsService } from "@/services/organizations"

export const memberKeys = {
  byOrg: (orgId: string) => ["members", orgId] as const,
}

export function useMembers(orgId: string) {
  return useQuery({
    queryKey: memberKeys.byOrg(orgId),
    queryFn: () => organizationsService.getMembers(orgId),
  })
}
