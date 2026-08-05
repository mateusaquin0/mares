"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  changePasswordSchema,
  updateProfileSchema,
  type ChangePasswordData,
  type UpdateProfileData,
} from "@/schemas/auth.schema"
import { LIMITS } from "@/schemas/limits"
import { updateProfileAction, changePasswordAction, deleteProfileAction } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/confirm-dialog"

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const t = useTranslations("profile")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const router = useRouter()

  const nameForm = useForm<UpdateProfileData>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name },
  })

  const pwForm = useForm<ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { password: "", confirm: "" },
  })

  const [deleting, setDeleting] = useState(false)

  async function onSaveName(data: UpdateProfileData) {
    const res = await updateProfileAction(data)
    if (res.error) {
      toast.error(t("saveError"))
      return
    }
    toast.success(t("saved"))
    router.refresh()
  }

  async function onChangePassword(data: ChangePasswordData) {
    const res = await changePasswordAction(data)
    if (res.error) {
      toast.error(t("passwordError"), { description: res.error })
      return
    }
    toast.success(t("passwordChanged"))
    pwForm.reset({ password: "", confirm: "" })
  }

  async function onDelete() {
    setDeleting(true)
    const res = await deleteProfileAction()
    if (res.error) {
      setDeleting(false)
      toast.error(t("deleteError"), { description: res.error })
      return
    }
    // Conta removida e sessão encerrada no servidor → volta ao login.
    router.push("/login")
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("nameSection")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={nameForm.handleSubmit(onSaveName)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("emailLabel")}</Label>
              <Input id="email" value={email} disabled readOnly />
              <p className="text-xs text-muted-foreground">{t("emailHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">{t("nameLabel")}</Label>
              <Input id="name" maxLength={LIMITS.name} {...nameForm.register("name")} />
              {nameForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {tval(nameForm.formState.errors.name.message!)}
                </p>
              )}
            </div>
            <Button type="submit" loading={nameForm.formState.isSubmitting}>
              {tc("save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("passwordSection")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={pwForm.handleSubmit(onChangePassword)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("newPassword")}</Label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                {...pwForm.register("password")}
              />
              {pwForm.formState.errors.password && (
                <p className="text-xs text-destructive">
                  {tval(pwForm.formState.errors.password.message!)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">{t("confirmPassword")}</Label>
              <PasswordInput
                id="confirm"
                autoComplete="new-password"
                {...pwForm.register("confirm")}
              />
              {pwForm.formState.errors.confirm && (
                <p className="text-xs text-destructive">
                  {tval(pwForm.formState.errors.confirm.message!)}
                </p>
              )}
            </div>
            <Button type="submit" loading={pwForm.formState.isSubmitting}>
              {t("changePassword")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-lg text-destructive">{t("dangerZone")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("deleteDesc")}</p>
          <ConfirmDialog
            title={t("deleteTitle")}
            description={t("deleteConfirmDesc")}
            confirmLabel={t("deleteButton")}
            destructive
            onConfirm={onDelete}
            trigger={
              <Button variant="destructive" loading={deleting}>
                {t("deleteButton")}
              </Button>
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
