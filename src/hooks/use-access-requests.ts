// MARES — Hook de mutação de Solicitações de acesso (endpoint público).

import { useMutation } from "@tanstack/react-query"

import { accessRequestsService } from "@/services/access-requests"
import type { AccessRequestData } from "@/schemas/organization.schema"

export function useCreateAccessRequest() {
  return useMutation({
    mutationFn: (data: AccessRequestData) => accessRequestsService.create(data),
  })
}
