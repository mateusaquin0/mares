// MARES — Solicitação de criação de um novo grupo de pesquisa (tela "Meus grupos de pesquisa").

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { organizationsService } from "@/services/organizations"

export const orgRequestKeys = {
  mine: () => ["org-requests", "mine"] as const,
}

// Solicitação do próprio usuário aguardando o admin da aplicação (ou null).
export function useMyOrgRequest() {
  return useQuery({
    queryKey: orgRequestKeys.mine(),
    queryFn: () => organizationsService.myOrgRequest(),
  })
}

export function useRequestNewOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (organizationName: string) => organizationsService.requestNewOrg(organizationName),
    // A tela troca o botão pelo aviso de "aguardando análise" — precisa reler a pendência.
    onSuccess: () => qc.invalidateQueries({ queryKey: orgRequestKeys.mine() }),
  })
}
