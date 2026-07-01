import Link from "next/link"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { SetPasswordForm } from "./set-password-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{t("invalidTitle")}</CardTitle>
          <CardDescription>{t("invalidDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link
            href="/auth/forgot-password"
            className="block text-sm font-medium text-primary hover:underline"
          >
            {t("requestNew")}
          </Link>
          <Link
            href="/login"
            className="block text-sm font-medium text-primary hover:underline"
          >
            {tc("backToLogin")}
          </Link>
        </CardContent>
      </Card>
    )
  }

  return <SetPasswordForm />
}
