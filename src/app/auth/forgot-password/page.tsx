"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { useTranslations } from "next-intl"

import { createClient } from "@/lib/supabase/client"
import { forgotPasswordSchema, type ForgotPasswordData } from "@/schemas/auth.schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{t("sentTitle")}</CardTitle>
          <CardDescription>{t("sentDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className="text-sm font-medium text-primary hover:underline">
            {tc("backToLogin")}
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
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
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            {tc("backToLogin")}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
