"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { MailCheck } from "lucide-react"

import { useTranslations } from "next-intl"

import { accessRequestSchema, type AccessRequestData } from "@/schemas/organization.schema"
import { LIMITS } from "@/schemas/limits"
import { useCreateAccessRequest } from "@/hooks/use-access-requests"
import { apiErrorBody } from "@/lib/http"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TermsCheckbox } from "@/components/terms-checkbox"
import { AuthState } from "@/components/auth-state"

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
      <p className="mt-1.5 text-pretty text-muted-foreground">{t("panelInfoDesc")}</p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 grid gap-3.5">
        <div className="grid gap-[3px]">
          <Label htmlFor="requesterName">{t("name")}</Label>
          <Input
            id="requesterName"
            autoComplete="name"
            maxLength={LIMITS.name}
            {...register("requesterName")}
          />
          {errors.requesterName && (
            <p className="text-sm text-destructive">{tval(errors.requesterName.message!)}</p>
          )}
        </div>
        <div className="grid gap-[3px]">
          <Label htmlFor="email">{tc("email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            maxLength={LIMITS.name}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{tval(errors.email.message!)}</p>
          )}
        </div>
        <div className="grid gap-[3px]">
          <Label htmlFor="organizationName">{t("orgName")}</Label>
          <Input
            id="organizationName"
            placeholder={t("orgPlaceholder")}
            maxLength={LIMITS.name}
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
        <Button type="submit" className="h-12 w-full text-base" loading={createM.isPending}>
          {t("submit")}
        </Button>
        <Button type="button" variant="outline" className="h-12 w-full text-base" asChild>
          <Link href="/login">{t("cancel")}</Link>
        </Button>
      </form>
      <p className="mt-4 text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center text-primary underline underline-offset-2 hover:text-foreground"
        >
          {t("signIn")}
        </Link>
      </p>
    </div>
  )
}
