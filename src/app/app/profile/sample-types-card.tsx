"use client"

import { useState, type FormEvent } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, Pencil, Plus, Trash2, X } from "lucide-react"

import { LIMITS } from "@/schemas/limits"
import { USER_SAMPLE_TYPE_MAX } from "@/schemas/user-sample-type.schema"
import { useErrorMessage } from "@/lib/use-error-message"
import {
  useUserSampleTypes,
  useAddUserSampleType,
  useRenameUserSampleType,
  useRemoveUserSampleType,
} from "@/hooks/use-user-sample-types"
import type { UserSampleType } from "@/types/user-sample-type"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function SampleTypesCard() {
  const t = useTranslations("profile.sampleTypes")
  const tc = useTranslations("common")
  const em = useErrorMessage()

  const { data: items = [], isLoading } = useUserSampleTypes()
  const addM = useAddUserSampleType()
  const renameM = useRenameUserSampleType()
  const removeM = useRemoveUserSampleType()

  const [draft, setDraft] = useState("")
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const full = items.length >= USER_SAMPLE_TYPE_MAX

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    const value = draft.trim()
    if (!value) return
    try {
      await addM.mutateAsync(value)
      setDraft("")
    } catch (err) {
      toast.error(t("addError"), { description: em(err) })
    }
  }

  async function onRename() {
    if (!editing) return
    const value = editing.value.trim()
    if (!value) return
    try {
      await renameM.mutateAsync({ id: editing.id, value })
      setEditing(null)
    } catch (err) {
      toast.error(t("renameError"), { description: em(err) })
    }
  }

  async function onRemove(item: UserSampleType) {
    try {
      await removeM.mutateAsync(item.id)
    } catch (err) {
      toast.error(t("removeError"), { description: em(err) })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("description")}</p>

        <form onSubmit={onAdd} className="flex gap-2">
          <Input
            aria-label={t("addLabel")}
            placeholder={t("addPlaceholder")}
            maxLength={LIMITS.name}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={full}
          />
          <Button type="submit" loading={addM.isPending} disabled={full || !draft.trim()}>
            <Plus className="size-4" />
            {t("add")}
          </Button>
        </form>
        {full && <p className="text-xs text-destructive">{t("full")}</p>}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                {editing?.id === item.id ? (
                  <>
                    <Input
                      autoFocus
                      className="h-8"
                      aria-label={t("renameLabel")}
                      maxLength={LIMITS.name}
                      value={editing.value}
                      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          void onRename()
                        }
                        if (e.key === "Escape") setEditing(null)
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      loading={renameM.isPending}
                      disabled={!editing.value.trim()}
                      onClick={() => void onRename()}
                    >
                      <Check className="size-4" />
                      <span className="sr-only">{tc("save")}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      onClick={() => setEditing(null)}
                    >
                      <X className="size-4" />
                      <span className="sr-only">{tc("cancel")}</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm">{item.value}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      onClick={() => setEditing({ id: item.id, value: item.value })}
                    >
                      <Pencil className="size-4" />
                      <span className="sr-only">{tc("edit")}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => void onRemove(item)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">{tc("delete")}</span>
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
