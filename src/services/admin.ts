// MARES — Serviço da área de administração global (client).

import { http } from "@/lib/http"
import type { z } from "zod"
import type { addMemberSchema } from "@/schemas/organization.schema"
import type { AdminOrg, AdminUser, JoinRequest } from "@/types/admin"
import type { OrgMemberRole } from "@/types/organization"

type AddMemberData = z.infer<typeof addMemberSchema>

export const adminService = {
  listUsers: () => http.get<AdminUser[]>("/api/admin/users"),
  removeUser: (id: string) => http.del(`/api/admin/users/${id}`),

  listPendingRequests: () =>
    http.get<JoinRequest[]>("/api/admin/access-requests?status=PENDING"),
  actOnRequest: (id: string, action: "approve" | "reject") =>
    http.post(`/api/admin/access-requests/${id}/${action}`),

  listOrganizations: () => http.get<AdminOrg[]>("/api/admin/organizations"),

  // Gestão de membros de qualquer grupo (admin global).
  addOrgMember: (orgId: string, data: AddMemberData) =>
    http.post<{ invited: boolean }>(`/api/admin/organizations/${orgId}/members`, data),
  setOrgMemberRole: (orgId: string, userId: string, role: OrgMemberRole) =>
    http.put(`/api/admin/organizations/${orgId}/members/${userId}`, { role }),
  removeOrgMember: (orgId: string, userId: string) =>
    http.del<{ orgDeactivated?: boolean }>(
      `/api/admin/organizations/${orgId}/members/${userId}`
    ),
}
