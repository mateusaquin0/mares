// MARES — Hooks de dados de Organizações e Membros (react-query).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { z } from "zod"

import { organizationsService } from "@/services/organizations"
import type { addMemberSchema, updateOrganizationSchema } from "@/schemas/organization.schema"
import type { OrgMemberRole } from "@/types/organization"

type AddMemberData = z.infer<typeof addMemberSchema>
type UpdateOrgData = z.infer<typeof updateOrganizationSchema>

export const memberKeys = {
  byOrg: (orgId: string) => ["members", orgId] as const,
}
export const orgKeys = {
  detail: (orgId: string) => ["organization", orgId] as const,
}

export function useMembers(orgId: string) {
  return useQuery({
    queryKey: memberKeys.byOrg(orgId),
    queryFn: () => organizationsService.getMembers(orgId),
  })
}

// Detalhe da organização (usado no prefill do formulário de edição).
export function useOrganization(orgId: string, enabled = true) {
  return useQuery({
    queryKey: orgKeys.detail(orgId),
    queryFn: () => organizationsService.get(orgId),
    enabled: enabled && !!orgId,
  })
}

// ── Mutações ─────────────────────────────────────────────────────────────────

export function useAddMember(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AddMemberData) => organizationsService.addMember(orgId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.byOrg(orgId) }),
  })
}

export function useUpdateOrganization(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateOrgData) => organizationsService.update(orgId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.detail(orgId) }),
  })
}

export function useSetMemberRole(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { userId: string; role: OrgMemberRole }) =>
      organizationsService.setMemberRole(orgId, vars.userId, vars.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.byOrg(orgId) }),
  })
}

export function useRemoveMember(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => organizationsService.removeMember(orgId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.byOrg(orgId) }),
  })
}

// Sair de uma organização (remove a si mesmo). Pode excluir a org (orgDeleted).
export function useLeaveOrganization() {
  return useMutation({
    mutationFn: (vars: { orgId: string; userId: string }) =>
      organizationsService.removeMember(vars.orgId, vars.userId),
  })
}

// Define a organização ativa (cookie).
export function useSetActiveOrg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orgId: string) => organizationsService.setActive(orgId),
    // Trocar a org ativa muda TODOS os dados escopados por organização (animais,
    // pesquisas, membros...). Como as chaves de query NÃO incluem o orgId, invalidamos
    // tudo para o cache não continuar exibindo dados da organização anterior.
    onSuccess: () => qc.invalidateQueries(),
  })
}
