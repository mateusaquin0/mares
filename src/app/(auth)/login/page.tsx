"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Mail, Lock, ArrowRight } from "lucide-react"

import { useTranslations } from "next-intl"

import { createClient } from "@/lib/supabase/client"
import { loginSchema, type LoginData } from "@/schemas/auth.schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"

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
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h2>
      <p className="mt-1.5 mb-7 text-sm text-muted-foreground">{t("description")}</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{tc("email")}</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              className="pl-9"
              {...register("email")}
            />
          </div>
          {errors.email && (
            <p className="text-sm text-destructive">{tval(errors.email.message!)}</p>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("password")}</Label>
            <Link
              href="/auth/forgot-password"
              className="text-xs font-medium text-accent-foreground hover:underline"
            >
              {t("forgot")}
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
            <PasswordInput
              id="password"
              autoComplete="current-password"
              className="pl-9"
              {...register("password")}
            />
          </div>
          {errors.password && (
            <p className="text-sm text-destructive">{tval(errors.password.message!)}</p>
          )}
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          {t("submit")}
          {!loading && <ArrowRight className="size-4" />}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link
          href="/request-access"
          className="font-semibold text-accent-foreground hover:underline"
        >
          {t("requestAccess")}
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
