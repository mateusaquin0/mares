// MARES — Serviço da área de administração global (client).

import { http } from "@/lib/http"
import type { AdminOrg, AdminUser, JoinRequest } from "@/types/admin"

export const adminService = {
  listUsers: () => http.get<AdminUser[]>("/api/admin/users"),
  removeUser: (id: string) => http.del(`/api/admin/users/${id}`),

  listPendingRequests: () =>
    http.get<JoinRequest[]>("/api/admin/access-requests?status=PENDING"),
  actOnRequest: (id: string, action: "approve" | "reject") =>
    http.post(`/api/admin/access-requests/${id}/${action}`),

  listOrganizations: () => http.get<AdminOrg[]>("/api/admin/organizations"),
}
