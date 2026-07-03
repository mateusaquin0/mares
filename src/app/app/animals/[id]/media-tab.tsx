"use client"

import { useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { FileText, Trash2, Upload } from "lucide-react"

import { useErrorMessage } from "@/lib/use-error-message"
import { useAnimalMedia, useUploadAnimalMedia, useDeleteAnimalMedia } from "@/hooks/use-animals"
import type { AnimalMedia } from "@/types/animal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/components/confirm-dialog"

export function MediaTab({ animalId, isOrgAdmin }: { animalId: string; isOrgAdmin: boolean }) {
  const t = useTranslations("media")
  const tc = useTranslations("common")
  const locale = useLocale()
  const em = useErrorMessage()
  const fileRef = useRef<HTMLInputElement>(null)

  const mediaQ = useAnimalMedia(animalId)
  const items = mediaQ.data ?? []
  const loading = mediaQ.isLoading
  const uploadM = useUploadAnimalMedia(animalId)
  const deleteM = useDeleteAnimalMedia(animalId)
  const [file, setFile] = useState<File | null>(null)
  const [label, setLabel] = useState("")
  const [confirm, setConfirm] = useState<AnimalMedia | null>(null)

  async function upload() {
    if (!file) return
    const body = new FormData()
    body.append("file", file)
    if (label.trim()) body.append("label", label.trim())
    try {
      await uploadM.mutateAsync(body)
      toast.success(t("uploaded"))
      setFile(null)
      setLabel("")
      if (fileRef.current) fileRef.current.value = ""
    } catch (err) {
      toast.error(t("uploadError"), { description: em(err) })
    }
  }

  async function remove(m: AnimalMedia) {
    try {
      await deleteM.mutateAsync(m.id)
      toast.success(t("deleted"))
    } catch (err) {
      toast.error(t("deleteError"), { description: em(err) })
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-2 rounded-md border p-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("selectFile")}</label>
          <Input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="max-w-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("label")}</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("labelPlaceholder")}
            className="max-w-xs"
          />
        </div>
        <Button onClick={upload} disabled={!file} loading={uploadM.isPending}>
          <Upload className="size-4" />
          {t("upload")}
        </Button>
        <p className="w-full text-xs text-muted-foreground">{t("allowedHint")}</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{tc("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {items.map((m) => {
            const isImage = m.mimeType.startsWith("image/")
            return (
              <div key={m.id} className="group relative overflow-hidden rounded-xl border bg-card shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover">
                <a
                  href={m.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-[4/3] bg-muted"
                >
                  {isImage && m.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt={m.label ?? ""} className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <FileText className="size-8 text-destructive/60" />
                      <span className="text-[11px] font-medium uppercase tracking-wider">PDF</span>
                    </span>
                  )}
                </a>
                <div className="flex items-center justify-between gap-1 border-t p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium" title={m.label ?? ""}>
                      {m.label || t("noLabel")}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{fmtDate(m.createdAt)}</p>
                  </div>
                  {isOrgAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-destructive"
                      onClick={() => setConfirm(m)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">{tc("delete")}</span>
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(o) => !o && setConfirm(null)}
          title={t("deleteTitle")}
          description={t("deleteDesc")}
          confirmLabel={tc("delete")}
          destructive
          onConfirm={() => remove(confirm)}
        />
      )}
    </div>
  )
}
