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
      <div className="text-center">
        <span className="mb-5 inline-flex size-16 items-center justify-center rounded-full bg-[hsl(var(--bio)/0.14)] text-[hsl(123_44%_30%)]">
          <MailCheck className="size-8" />
        </span>
        <h2 className="mb-2.5 text-2xl font-semibold tracking-tight text-foreground">
          {t("sentTitle")}
        </h2>
        <p className="mx-auto mb-7 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t("sentDescription")}
        </p>
        <Button variant="outline" asChild>
          <Link href="/login">{tc("backToLogin")}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h2>
      <p className="mt-1.5 mb-7 text-sm text-muted-foreground">{t("description")}</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{tc("email")}</Label>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          {errors.email && (
            <p className="text-sm text-destructive">{tval(errors.email.message!)}</p>
          )}
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          {t("submit")}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-semibold text-accent-foreground hover:underline">
          {tc("backToLogin")}
        </Link>
      </p>
    </div>
  )
}
