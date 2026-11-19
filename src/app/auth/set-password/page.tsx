import Link from "next/link"
import { getTranslations } from "next-intl/server"

import { AlertTriangle } from "lucide-react"

import { AuthState } from "@/components/auth-state"
import { Button } from "@/components/ui/button"

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
        <Button className="h-12 w-full text-base" asChild>
          <Link href="/auth/forgot-password">{t("requestNew")}</Link>
        </Button>
        <Button variant="outline" className="h-12 w-full text-base" asChild>
          <Link href="/login">{tc("backToLogin")}</Link>
        </Button>
      </AuthState>
    )
  }

  return <SetPasswordForm />
}
