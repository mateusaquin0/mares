"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { useTranslations } from "next-intl"

import { createClient } from "@/lib/supabase/client"
import { loginSchema, type LoginData } from "@/schemas/auth.schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"

// `redirectTo` vem da query string: só aceitamos caminho interno. Sem isto,
// /login?redirectTo=https://evil.com mandaria a pessoa recém-autenticada para fora do
// domínio (open redirect). "//host" e "/\host" contam como externos para o navegador.
function safeRedirect(value: string | null): string {
  const fallback = "/app/dashboard"
  if (!value || !value.startsWith("/")) return fallback
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback
  // O navegador descarta TAB/CR/LF ao resolver a URL: "/\t/host" viraria "//host".
  if (/[\u0000-\u001f]/.test(value)) return fallback
  return value
}

function LoginForm() {
  const t = useTranslations("login")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const redirectTo = safeRedirect(searchParams.get("redirectTo"))
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

    // Descarta qualquer cache de uma sessão anterior antes de entrar. O logout já limpa
    // (ver useSignOut), mas nem todo caminho até aqui passa por ele: sessão expirada e
    // redirecionada para /login, ou alguém que simplesmente navegou até esta tela, chegam
    // com o QueryClient ainda povoado. Como as chaves não incluem o usuário, sem isto a
    // conta que acabou de entrar veria os dados da anterior.
    queryClient.clear()

    toast.success(t("success"))

    // Navegação DURA, não router.push: o destino pode redirecionar no servidor (o admin
    // global sem grupo ativo cai de /app/dashboard em /app/admin/access-requests, ver
    // access-guards.ts). Numa navegação client-side esse redirect vira MPA navigation no
    // reducer do Next, e o `Router` interno quebra com "Rendered more hooks than during the
    // previous render" ao re-renderizar em cima de uma tentativa suspensa. Entrar é uma
    // troca de sessão: recarregar a página é o comportamento correto de todo modo.
    window.location.assign(redirectTo)
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
        <div className="grid gap-[3px]">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("password")}</Label>
            <Link
              href="/auth/forgot-password"
              className="-my-3 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-2 hover:text-foreground"
            >
              {t("forgot")}
            </Link>
          </div>
          <PasswordInput id="password" autoComplete="current-password" {...register("password")} />
          {errors.password && (
            <p className="text-sm text-destructive">{tval(errors.password.message!)}</p>
          )}
        </div>
        <Button type="submit" className="h-12 w-full text-base" loading={loading}>
          {t("submit")}
        </Button>
      </form>
      <p className="mt-4 text-muted-foreground">
        {t("noAccount")}{" "}
        <Link
          href="/request-access"
          className="inline-flex min-h-11 items-center text-primary underline underline-offset-2 hover:text-foreground"
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
