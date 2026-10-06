"use client"

import { useEffect, useRef } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"

import { createResearchSchema, type CreateResearchData } from "@/schemas/research.schema"
import { LIMITS } from "@/schemas/limits"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CharCounter } from "@/components/ui/char-counter"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const EMPTY: CreateResearchData = { name: "", description: "", isPublic: false }

// Formulário de pesquisa (nome, descrição, visibilidade), usado tanto na criação pelo catálogo
// quanto na edição — pela listagem e pela página de detalhe. A mutação, o toast e a navegação
// ficam com quem chama: só o formulário é comum.
export function ResearchFormDialog({
  open,
  onOpenChange,
  canEditVisibility,
  initial,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Admin do grupo ou criador da pesquisa (na criação, sempre). Ver docs/PERMISSOES.md.
  canEditVisibility: boolean
  // Ausente = criação. Presente = edição, com os valores atuais da pesquisa.
  initial?: CreateResearchData
  onSubmit: (data: CreateResearchData) => Promise<void>
}) {
  const t = useTranslations("research")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const isEdit = !!initial

  const form = useForm<CreateResearchData>({
    resolver: zodResolver(createResearchSchema),
    defaultValues: EMPTY,
  })

  // Recarrega os valores só na ABERTURA: a mesma instância atende criação e edição de
  // pesquisas diferentes. O `initial` vai por ref porque quem chama costuma montá-lo inline —
  // como dependência do efeito, um objeto novo a cada render apagaria o que está sendo digitado.
  const { reset } = form
  const initialRef = useRef(initial)
  initialRef.current = initial
  useEffect(() => {
    if (open) reset(initialRef.current ?? EMPTY)
  }, [open, reset])

  // Quem não vê o campo de visibilidade também não o envia.
  const submit = form.handleSubmit((data) =>
    onSubmit(canEditVisibility ? data : { ...data, isPublic: undefined }),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dirty={form.formState.isDirty}>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="research-name">{t("nameLabel")}</Label>
              <CharCounter value={form.watch("name")} max={LIMITS.researchName} />
            </div>
            <Input id="research-name" maxLength={LIMITS.researchName} {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">
                {tval(form.formState.errors.name.message!)}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="research-description">{t("descriptionLabel")}</Label>
              <CharCounter value={form.watch("description")} max={LIMITS.longText} />
            </div>
            <Textarea
              id="research-description"
              rows={3}
              maxLength={LIMITS.longText}
              {...form.register("description")}
            />
          </div>
          {canEditVisibility && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="research-is-public"
                checked={form.watch("isPublic")}
                onCheckedChange={(v) => form.setValue("isPublic", v === true)}
                className="mt-0.5"
              />
              <Label
                htmlFor="research-is-public"
                className="text-sm font-normal text-muted-foreground"
              >
                {t("isPublicHint")}
              </Label>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {isEdit ? tc("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
