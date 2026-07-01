"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { useTranslations } from "next-intl"

import { accessRequestSchema, type AccessRequestData } from "@/schemas/organization.schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TermsCheckbox } from "@/components/terms-checkbox"

export default function RequestAccessPage() {
  const t = useTranslations("requestAccess")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

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
    setLoading(true)
    const res = await fetch("/api/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    setLoading(false)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(t("errorTitle"), {
        description: typeof body.error === "string" ? body.error : undefined,
      })
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
          <Button type="submit" className="w-full" loading={loading}>
            {t("submit")}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t("haveAccount")}{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t("signIn")}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
