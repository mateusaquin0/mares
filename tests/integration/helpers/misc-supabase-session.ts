// Substituto do cliente Supabase de SESSÃO (src/lib/supabase/server.ts) para os testes das
// server actions: só o que elas usam do Auth — quem está logado, troca de senha e saída.
// O arquivo de teste registra com:
//   vi.mock("@/lib/supabase/server", async () => await import("./helpers/misc-supabase-session"))

type State = {
  // Id do usuário da sessão; null = sem sessão.
  userId: string | null
  // Quando preenchido, a próxima troca de senha falha com esta mensagem.
  updateError: string | null
  // Atributos recebidos por `auth.updateUser`, em ordem.
  updates: Record<string, unknown>[]
  signOuts: number
}

const holder = globalThis as unknown as { __maresSupabaseSession?: State }

export const sessionAuth: State & { reset(): void } = Object.assign(
  (holder.__maresSupabaseSession ??= { userId: null, updateError: null, updates: [], signOuts: 0 }),
  {
    reset() {
      sessionAuth.userId = null
      sessionAuth.updateError = null
      sessionAuth.updates.length = 0
      sessionAuth.signOuts = 0
    },
  },
)

export async function createClient() {
  return {
    auth: {
      async getUser() {
        return {
          data: { user: sessionAuth.userId ? { id: sessionAuth.userId } : null },
          error: null,
        }
      },
      async getClaims() {
        return { data: sessionAuth.userId ? { claims: { sub: sessionAuth.userId } } : null }
      },
      async updateUser(attributes: Record<string, unknown>) {
        if (sessionAuth.updateError) {
          const message = sessionAuth.updateError
          sessionAuth.updateError = null
          return { data: { user: null }, error: { message } }
        }
        sessionAuth.updates.push(attributes)
        return { data: { user: { id: sessionAuth.userId } }, error: null }
      },
      async signOut() {
        sessionAuth.signOuts++
        return { error: null }
      },
    },
  }
}
