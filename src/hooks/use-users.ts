// MARES — Hooks de usuários (react-query).

import { useMutation } from "@tanstack/react-query"

import { usersService } from "@/services/users"

// Busca sob demanda (lupa) de um usuário por e-mail no convite de membro.
export function useLookupUser() {
  return useMutation({
    mutationFn: (email: string) => usersService.lookup(email),
  })
}
