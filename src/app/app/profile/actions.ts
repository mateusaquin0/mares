"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { deactivateOrgIfEmpty } from "@/lib/org-lifecycle"
import { changePasswordSchema, updateProfileSchema } from "@/schemas/auth.schema"

// Todas as ações operam sobre o PRÓPRIO usuário autenticado (nunca recebem um id do cliente).

// Atualiza o nome de exibição do usuário.
export async function updateProfileAction(input: { name: string }): Promise<{ error?: string }> {
  const parsed = updateProfileSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid" }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "unauthenticated" }

  await prisma.user.updateMany({
    where: { id: user.id },
    data: { name: parsed.data.name.trim() },
  })
  // A sidebar (layout) exibe o nome — revalida para refletir a mudança.
  revalidatePath("/app", "layout")
  return {}
}

// Troca a senha do usuário autenticado (Supabase Auth).
export async function changePasswordAction(input: {
  password: string
  confirm: string
}): Promise<{ error?: string }> {
  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid" }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "unauthenticated" }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: error.message }
  return {}
}

// Exclui o próprio perfil (Auth + banco). Os dados científicos PERMANECEM: a autoria em
// Research vira nula (onDelete: SetNull) e amostras/animais não referenciam o usuário. Os
// vínculos (Membership) caem em cascata; grupos que ficam sem membros são desativados.
export async function deleteProfileAction(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "unauthenticated" }

  // Captura as organizações antes de remover os vínculos (para desativar as que esvaziarem).
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    select: { orgId: true },
  })
  const orgIds = memberships.map((m) => m.orgId)

  // Remove do Supabase Auth; ignora "not found" (conta já ausente no Auth).
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error && !/not found/i.test(error.message)) return { error: error.message }

  // Remove o registro local (cascade nos Membership). deleteMany não lança se já não existir.
  await prisma.user.deleteMany({ where: { id: user.id } })

  // Desativa cada grupo que ficou sem membros.
  for (const orgId of orgIds) await deactivateOrgIfEmpty(orgId)

  // Encerra a sessão (limpa os cookies na resposta).
  await supabase.auth.signOut()
  return {}
}
