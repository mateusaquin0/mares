"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Info, ArrowRight } from "lucide-react"

import { useTranslations } from "next-intl"

import { accessRequestSchema, type AccessRequestData } from "@/schemas/organization.schema"
import { useCreateAccessRequest } from "@/hooks/use-access-requests"
import { apiErrorBody } from "@/lib/http"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TermsCheckbox } from "@/components/terms-checkbox"

export default function RequestAccessPage() {
  const t = useTranslations("requestAccess")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const [sent, setSent] = useState(false)
  const createM = useCreateAccessRequest()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AccessRequestData>({
    resolver: zodResolver(accessRequestSchema),
    defaultValues: { acceptTerms: false },
  })

  async function onSubmit(data: AccessRequestData) {
    try {
      await createM.mutateAsync(data)
      setSent(true)
    } catch (err) {
      const body = apiErrorBody(err) as { error?: unknown } | null
      toast.error(t("errorTitle"), {
        description: typeof body?.error === "string" ? body.error : undefined,
      })
    }
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
    <Card className="grid w-full max-w-4xl overflow-hidden p-0 md:grid-cols-2">
      {/* Painel institucional (esquerda) */}
      <div className="flex flex-col justify-between gap-8 bg-primary p-8 text-primary-foreground">
        <div className="space-y-3">
          <h2 className="text-2xl font-bold tracking-tight">{t("panelTitle")}</h2>
          <p className="text-sm text-primary-foreground/80">{t("panelDesc")}</p>
        </div>
        <div className="rounded-lg bg-white/10 p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <Info className="size-4" />
            {t("panelInfoTitle")}
          </div>
          <p className="text-xs text-primary-foreground/70">{t("panelInfoDesc")}</p>
        </div>
      </div>

      {/* Formulário (direita) */}
      <div className="p-8">
        <h3 className="mb-6 text-lg font-semibold text-foreground">{t("formTitle")}</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="requesterName">{t("name")}</Label>
            <Input id="requesterName" autoComplete="name" {...register("requesterName")} />
            {errors.requesterName && (
              <p className="text-sm text-destructive">{tval(errors.requesterName.message!)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{tc("email")}</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {errors.email && (
              <p className="text-sm text-destructive">{tval(errors.email.message!)}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="organizationName">{t("orgName")}</Label>
            <Input
              id="organizationName"
              placeholder={t("orgPlaceholder")}
              {...register("organizationName")}
            />
            {errors.organizationName && (
              <p className="text-sm text-destructive">{tval(errors.organizationName.message!)}</p>
            )}
          </div>
          <TermsCheckbox
            checked={watch("acceptTerms")}
            onCheckedChange={(v) =>
              setValue("acceptTerms", v, { shouldValidate: true })
            }
            error={errors.acceptTerms ? tval(errors.acceptTerms.message!) : undefined}
          />
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" asChild>
              <Link href="/login">{t("cancel")}</Link>
            </Button>
            <Button type="submit" loading={createM.isPending}>
              {t("submit")}
              {!createM.isPending && <ArrowRight className="size-4" />}
            </Button>
          </div>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t("haveAccount")}{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t("signIn")}
          </Link>
        </p>
      </div>
    </Card>
  )
}
