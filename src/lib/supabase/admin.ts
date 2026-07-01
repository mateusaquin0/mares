// MARES — Cliente Supabase com service role (Auth Admin API + bypass de RLS).
// Usar APENAS no servidor (Route Handlers). Nunca importar em Client Components.

import { createClient } from "@supabase/supabase-js"

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Convida um usuário por e-mail (envia o link do Supabase para definir a senha).
// Retorna o id do usuário criado no Auth.
export async function inviteUser(email: string): Promise<string> {
  const admin = createAdminClient()
  // Convidados definem a senha antes de entrar; o link do convite leva a /auth/confirm,
  // que valida o token e redireciona para /auth/set-password.
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/confirm?next=/auth/set-password`
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
  if (error || !data.user) {
    throw new Error(error?.message ?? "Falha ao convidar usuário")
  }
  return data.user.id
}
