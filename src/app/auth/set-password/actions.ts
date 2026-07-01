"use server"

import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { setPasswordSchema } from "@/schemas/auth.schema"
import { TERMS_VERSION } from "@/lib/terms"

// Define a senha do usuário autenticado (sessão criada pela rota /auth/confirm), registra o
// aceite dos Termos de Uso e marca a conta como ACTIVE. Roda no servidor — evita o SDK de
// auth no navegador.
export async function setPasswordAction(input: {
  password: string
  confirm: string
  acceptTerms: boolean
}): Promise<{ error?: string }> {
  const parsed = setPasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Sessão expirada. Solicite um novo link para definir a senha." }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: error.message }

  // updateMany não lança se a linha não existir (a senha já foi definida no Auth).
  await prisma.user.updateMany({
    where: { id: user.id },
    data: {
      status: "ACTIVE",
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: new Date(),
    },
  })
  return {}
}
