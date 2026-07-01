"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { useTranslations } from "next-intl"

import { createClient } from "@/lib/supabase/client"
import { loginSchema, type LoginData } from "@/schemas/auth.schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function LoginForm() {
  const t = useTranslations("login")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get("redirectTo") || "/app/dashboard"
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginData>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(data: LoginData) {
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword(data)
    setLoading(false)

    if (error) {
      toast.error(t("errorTitle"), { description: error.message })
      return
    }

    toast.success(t("success"))
    router.push(redirectTo)
    router.refresh()
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t("password")}</Label>
              <Link
                href="/auth/forgot-password"
                className="text-xs font-medium text-primary hover:underline"
              >
                {t("forgot")}
              </Link>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{tval(errors.password.message!)}</p>
            )}
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            {t("submit")}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link href="/request-access" className="font-medium text-primary hover:underline">
            {t("requestAccess")}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
