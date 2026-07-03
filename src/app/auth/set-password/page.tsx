import Link from "next/link"
import { getTranslations } from "next-intl/server"

import { AlertTriangle } from "lucide-react"

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
      <div className="text-center">
        <span className="mb-5 inline-flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-8" />
        </span>
        <h2 className="mb-2.5 text-2xl font-semibold tracking-tight text-foreground">
          {t("invalidTitle")}
        </h2>
        <p className="mx-auto mb-7 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t("invalidDescription")}
        </p>
        <div className="flex flex-col items-center gap-2 text-sm font-semibold">
          <Link href="/auth/forgot-password" className="text-accent-foreground hover:underline">
            {t("requestNew")}
          </Link>
          <Link href="/login" className="text-accent-foreground hover:underline">
            {tc("backToLogin")}
          </Link>
        </div>
      </div>
    )
  }

  return <SetPasswordForm />
}
