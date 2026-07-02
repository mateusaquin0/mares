// MARES — Hooks de dados da área de administração global (react-query).

import { useQuery } from "@tanstack/react-query"

import { adminService } from "@/services/admin"

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
