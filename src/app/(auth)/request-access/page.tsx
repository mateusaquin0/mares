"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { ArrowRight, MailCheck } from "lucide-react"

import { useTranslations } from "next-intl"

import { accessRequestSchema, type AccessRequestData } from "@/schemas/organization.schema"
import { useCreateAccessRequest } from "@/hooks/use-access-requests"
import { apiErrorBody } from "@/lib/http"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
      <p className="mt-1.5 mb-7 text-sm text-muted-foreground">{t("panelInfoDesc")}</p>
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
          onCheckedChange={(v) => setValue("acceptTerms", v, { shouldValidate: true })}
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
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-accent-foreground hover:underline">
          {t("signIn")}
        </Link>
      </p>
    </div>
  )
}
