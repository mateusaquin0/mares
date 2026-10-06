"use client"

// MARES — Pedir a criação de um novo grupo de pesquisa.
//
// Quem já tem conta não cria grupo sozinho: a solicitação vai para o admin da aplicação, que a
// aprova (e só então o grupo existe, com quem pediu como admin dele). Por isso o formulário pede
// só o nome — quem solicita vem da sessão, no servidor.

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"

import { newOrgRequestSchema, type NewOrgRequestData } from "@/schemas/organization.schema"
import { LIMITS } from "@/schemas/limits"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const EMPTY: NewOrgRequestData = { organizationName: "" }

export function NewOrgRequestDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: NewOrgRequestData) => Promise<void>
}) {
  const t = useTranslations("myOrgs")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")

  const form = useForm<NewOrgRequestData>({
    resolver: zodResolver(newOrgRequestSchema),
    defaultValues: EMPTY,
  })

  const { reset } = form
  useEffect(() => {
    if (open) reset(EMPTY)
  }, [open, reset])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dirty={form.formState.isDirty}>
        <DialogHeader>
          <DialogTitle>{t("requestTitle")}</DialogTitle>
          <DialogDescription>{t("requestDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="new-org-name">{t("requestNameLabel")}</Label>
            <Input
              id="new-org-name"
              maxLength={LIMITS.name}
              placeholder={t("requestNamePlaceholder")}
              {...form.register("organizationName")}
            />
            {form.formState.errors.organizationName && (
              <p className="text-xs text-destructive">
                {tval(form.formState.errors.organizationName.message!)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {t("requestSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
