// MARES — Hooks de dados da área de administração global (react-query).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { z } from "zod"

import { adminService } from "@/services/admin"
import type { addMemberSchema } from "@/schemas/organization.schema"
import type { OrgMemberRole } from "@/types/organization"

type AddMemberData = z.infer<typeof addMemberSchema>

export const adminKeys = {
  users: () => ["admin", "users"] as const,
  requests: () => ["admin", "access-requests"] as const,
  organizations: () => ["admin", "organizations"] as const,
}

export function useAdminUsers() {
  return useQuery({ queryKey: adminKeys.users(), queryFn: () => adminService.listUsers() })
}

export function useAccessRequests() {
  return useQuery({
    queryKey: adminKeys.requests(),
    queryFn: () => adminService.listPendingRequests(),
  })
}

export function useAdminOrganizations() {
  return useQuery({
    queryKey: adminKeys.organizations(),
    queryFn: () => adminService.listOrganizations(),
  })
}

// ── Mutações ─────────────────────────────────────────────────────────────────

export function useRemoveUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => adminService.removeUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.users() }),
  })
}

export function useActOnRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; action: "approve" | "reject" }) =>
      adminService.actOnRequest(vars.id, vars.action),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.requests() }),
  })
}

// ── Gestão de membros de qualquer grupo (admin global) ─────────────────────────

export function useAddOrgMember(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AddMemberData) => adminService.addOrgMember(orgId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.organizations() }),
  })
}

export function useSetOrgMemberRole(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { userId: string; role: OrgMemberRole }) =>
      adminService.setOrgMemberRole(orgId, vars.userId, vars.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.organizations() }),
  })
}

export function useRemoveOrgMember(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => adminService.removeOrgMember(orgId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.organizations() }),
  })
}
