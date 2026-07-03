"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { useTranslations } from "next-intl"

import { setPasswordSchema, type SetPasswordData } from "@/schemas/auth.schema"
import { setPasswordAction } from "./actions"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { TermsCheckbox } from "@/components/terms-checkbox"

export function SetPasswordForm() {
  const t = useTranslations("setPassword")
  const tval = useTranslations("validation")
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SetPasswordData>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { acceptTerms: false },
  })

  async function onSubmit(data: SetPasswordData) {
    setLoading(true)
    const result = await setPasswordAction(data)
    if (result.error) {
      setLoading(false)
      toast.error(t("errorTitle"), { description: result.error })
      return
    }
    toast.success(t("success"))
    router.push("/app/dashboard")
    router.refresh()
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h2>
      <p className="mt-1.5 mb-7 text-sm text-muted-foreground">{t("description")}</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">{t("newPassword")}</Label>
          <PasswordInput id="password" autoComplete="new-password" {...register("password")} />
          {errors.password && (
            <p className="text-sm text-destructive">{tval(errors.password.message!)}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{t("confirm")}</Label>
          <PasswordInput id="confirm" autoComplete="new-password" {...register("confirm")} />
          {errors.confirm && (
            <p className="text-sm text-destructive">{tval(errors.confirm.message!)}</p>
          )}
        </div>
        <TermsCheckbox
          checked={watch("acceptTerms")}
          onCheckedChange={(v) => setValue("acceptTerms", v, { shouldValidate: true })}
          error={errors.acceptTerms ? tval(errors.acceptTerms.message!) : undefined}
        />
        <Button type="submit" className="w-full" loading={loading}>
          {t("submit")}
        </Button>
      </form>
    </div>
  )
}
