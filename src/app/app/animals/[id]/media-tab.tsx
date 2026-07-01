"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { FileText, Trash2, Upload } from "lucide-react"

import { useErrorMessage } from "@/lib/use-error-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/components/confirm-dialog"

type Media = {
  id: string
  url: string | null
  mimeType: string
  label: string | null
  createdAt: string
}

export function MediaTab({ animalId, isOrgAdmin }: { animalId: string; isOrgAdmin: boolean }) {
  const t = useTranslations("media")
  const tc = useTranslations("common")
  const locale = useLocale()
  const em = useErrorMessage()
  const fileRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [label, setLabel] = useState("")
  const [uploading, setUploading] = useState(false)
  const [confirm, setConfirm] = useState<Media | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/animals/${animalId}/media`)
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }, [animalId])

  useEffect(() => {
    load()
  }, [load])

  async function upload() {
    if (!file) return
    const body = new FormData()
    body.append("file", file)
    if (label.trim()) body.append("label", label.trim())
    setUploading(true)
    const res = await fetch(`/api/animals/${animalId}/media`, { method: "POST", body })
    setUploading(false)
    if (!res.ok) {
      toast.error(t("uploadError"), { description: em(await res.json().catch(() => ({}))) })
      return
    }
    toast.success(t("uploaded"))
    setFile(null)
    setLabel("")
    if (fileRef.current) fileRef.current.value = ""
    load()
  }

  async function remove(m: Media) {
    const res = await fetch(`/api/media/${m.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error(t("deleteError"), { description: em(await res.json().catch(() => ({}))) })
      return
    }
    toast.success(t("deleted"))
    setItems((prev) => prev.filter((x) => x.id !== m.id))
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
        <Button onClick={upload} disabled={!file} loading={uploading}>
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
              <div key={m.id} className="group relative overflow-hidden rounded-md border">
                <a
                  href={m.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square bg-muted"
                >
                  {isImage && m.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt={m.label ?? ""} className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <FileText className="size-10" />
                      <span className="text-xs">{t("pdf")}</span>
                    </span>
                  )}
                </a>
                <div className="flex items-center justify-between gap-1 p-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium" title={m.label ?? ""}>
                      {m.label || t("noLabel")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{fmtDate(m.createdAt)}</p>
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
