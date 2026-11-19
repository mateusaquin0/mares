import Link from "next/link"
import { getTranslations } from "next-intl/server"

import { AlertTriangle } from "lucide-react"

import { AuthState } from "@/components/auth-state"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

import { createClient } from "@/lib/supabase/server"
import { SetPasswordForm } from "./set-password-form"

// Server Component: valida a sessão criada pela rota /auth/confirm de forma confiável
// (sem depender do SDK de auth no navegador).
export default async function SetPasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const t = await getTranslations("setPassword")
    const tc = await getTranslations("common")
    return (
      <AuthState
        icon={AlertTriangle}
        tone="destructive"
        title={t("invalidTitle")}
        description={t("invalidDescription")}
      >
        {/* Server Component: links com o estilo do botão, sem o Slot do Radix (só cliente). */}
        <Link
          href="/auth/forgot-password"
          className={cn(buttonVariants(), "h-12 w-full text-base")}
        >
          {t("requestNew")}
        </Link>
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "outline" }), "h-12 w-full text-base")}
        >
          {tc("backToLogin")}
        </Link>
      </AuthState>
    )
  }

  return <SetPasswordForm />
}
