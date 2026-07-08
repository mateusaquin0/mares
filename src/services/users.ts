// MARES — Serviço de usuários (client).

import { http } from "@/lib/http"

export type UserLookup = { exists: boolean; name: string | null }

export const usersService = {
  // Busca um usuário da plataforma por e-mail (convite de membro).
  lookup: (email: string) =>
    http.get<UserLookup>(`/api/users/lookup?email=${encodeURIComponent(email)}`),
}
