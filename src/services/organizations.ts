// MARES — Serviço de Organizações, Membros e organização ativa (client).

import { http } from "@/lib/http"
import type { z } from "zod"
import type { addMemberSchema, updateOrganizationSchema } from "@/schemas/organization.schema"
import type { Member, OrgDetail, OrgMemberRole } from "@/types/organization"

type AddMemberData = z.infer<typeof addMemberSchema>
type UpdateOrgData = z.infer<typeof updateOrganizationSchema>

export const organizationsService = {
  getMembers: (orgId: string) => http.get<Member[]>(`/api/organizations/${orgId}/members`),
  addMember: (orgId: string, data: AddMemberData) =>
    http.post<{ invited: boolean }>(`/api/organizations/${orgId}/members`, data),
  get: (orgId: string) => http.get<OrgDetail>(`/api/organizations/${orgId}`),
  update: (orgId: string, data: UpdateOrgData) => http.patch(`/api/organizations/${orgId}`, data),
  setMemberRole: (orgId: string, userId: string, role: OrgMemberRole) =>
    http.put(`/api/organizations/${orgId}/members/${userId}`, { role }),
  removeMember: (orgId: string, userId: string) =>
    http.del<{ orgDeactivated?: boolean }>(`/api/organizations/${orgId}/members/${userId}`),
  resendInvite: (orgId: string, userId: string) =>
    http.post(`/api/organizations/${orgId}/members/${userId}/resend-invite`),

  // Define a organização ativa (cookie) para o usuário.
  setActive: (orgId: string) => http.post("/api/active-org", { orgId }),

  // Limpa a organização ativa. O cookie é httpOnly, então só o servidor a remove.
  clearActive: () => http.del("/api/active-org"),
}
