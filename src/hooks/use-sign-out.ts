"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import { organizationsService } from "@/services/organizations"

// Encerra a sessão e limpa TODO o estado do cliente antes de sair.
//
// Por que o `queryClient.clear()` é obrigatório aqui: o QueryClient é criado uma única vez
// em src/components/providers.tsx e sobrevive a toda navegação client-side — inclusive
// sair para /login e entrar com outra conta. As chaves de cache (animalKeys.list(),
// adminKeys.users(), ...) NÃO incluem o usuário: quem filtra por sessão é o servidor. Sem a
// limpeza, a conta nova reencontra as mesmas chaves e o React Query devolve, direto do
// cache e sem ir à rede, os dados da conta anterior (`staleTime` de 60s).
//
// O `router.refresh()` sozinho não resolve: ele invalida o cache de rotas do Next (conteúdo
// renderizado no servidor), que é independente do cache do React Query.
export function useSignOut() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)

  async function signOut() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()

    // Cookie httpOnly de organização ativa: só o servidor apaga. Se falhar, seguimos com o
    // logout mesmo assim — não vale prender a pessoa numa sessão por causa disto.
    await organizationsService.clearActive().catch(() => {})

    queryClient.clear()
    router.push("/login")
    router.refresh()
  }

  return { signOut, loading }
}
