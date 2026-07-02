// MARES — Serviço de solicitações de acesso (client, endpoint público).

import { http } from "@/lib/http"
import type { AccessRequestData } from "@/schemas/organization.schema"

export const accessRequestsService = {
  create: (data: AccessRequestData) => http.post("/api/access-requests", data),
}
