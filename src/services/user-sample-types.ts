// MARES — Serviço da lista pessoal de tipos de amostra (client).

import { http } from "@/lib/http"
import type { UserSampleType } from "@/types/user-sample-type"

const base = "/api/me/sample-types"

export const userSampleTypesService = {
  list: () => http.get<UserSampleType[]>(base),
  add: (value: string) => http.post<UserSampleType>(base, { value }),
  rename: (id: string, value: string) => http.patch<UserSampleType>(`${base}/${id}`, { value }),
  remove: (id: string) => http.del(`${base}/${id}`),
}
