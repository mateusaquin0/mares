"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { useTranslations } from "next-intl"

import { createClient } from "@/lib/supabase/client"
import { forgotPasswordSchema, type ForgotPasswordData } from "@/schemas/auth.schema"
import { MailCheck } from "lucide-react"

import { AuthState } from "@/components/auth-state"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ForgotPasswordPage() {
  const t = useTranslations("forgotPassword")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordData>({ resolver: zodResolver(forgotPasswordSchema) })

  async function onSubmit(data: ForgotPasswordData) {
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/auth/set-password`,
    })
    setLoading(false)
    if (error) {
      toast.error(t("errorTitle"), { description: error.message })
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthState
        icon={MailCheck}
        tone="positive"
        title={t("sentTitle")}
        description={t("sentDescription")}
      >
        <Button variant="outline" className="h-12 w-full text-base" asChild>
          <Link href="/login">{tc("backToLogin")}</Link>
        </Button>
      </AuthState>
    )
  }

  return (
    <div>
      <h1 className="font-serif text-[32px] font-medium leading-[38px]">{t("title")}</h1>
      <p className="mt-1.5 text-pretty text-muted-foreground">{t("description")}</p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 grid gap-3.5">
        <div className="grid gap-[3px]">
          <Label htmlFor="email">{tc("email")}</Label>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          {errors.email && (
            <p className="text-sm text-destructive">{tval(errors.email.message!)}</p>
          )}
        </div>
        <Button type="submit" className="h-12 w-full text-base" loading={loading}>
          {t("submit")}
        </Button>
      </form>
      <p className="mt-4 text-muted-foreground">
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center text-primary underline underline-offset-2 hover:text-foreground"
        >
          {tc("backToLogin")}
        </Link>
      </p>
    </div>
  )
}
