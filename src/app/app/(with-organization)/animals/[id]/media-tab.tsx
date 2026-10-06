"use client"

import { useMemo, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { FileText, Pencil, Trash2, Upload } from "lucide-react"

import { useErrorMessage } from "@/lib/use-error-message"
import { canDeleteAuthored } from "@/lib/authorship"
import { LIMITS } from "@/schemas/limits"
import {
  useAnimalMedia,
  useUploadAnimalMedia,
  useUpdateAnimalMedia,
  useDeleteAnimalMedia,
} from "@/hooks/use-animals"
import { useResearchList } from "@/hooks/use-research"
import type { AnimalMedia } from "@/types/animal"
import { Button } from "@/components/ui/button"
import { CharCounter } from "@/components/ui/char-counter"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"

export function MediaTab({
  animalId,
  isOrgAdmin,
  selfId,
  researches,
}: {
  animalId: string
  isOrgAdmin: boolean
  selfId: string
  // Pesquisas do indivíduo (primária + participações). O arquivo pertence a uma delas.
  researches: { id: string; name: string }[]
}) {
  const t = useTranslations("media")
  const tc = useTranslations("common")
  const locale = useLocale()
  const em = useErrorMessage()
  const fileRef = useRef<HTMLInputElement>(null)

  const mediaQ = useAnimalMedia(animalId)
  const items = mediaQ.data ?? []
  const loading = mediaQ.isLoading
  const uploadM = useUploadAnimalMedia(animalId)
  const updateM = useUpdateAnimalMedia(animalId)
  const deleteM = useDeleteAnimalMedia(animalId)
  const [file, setFile] = useState<File | null>(null)
  const [label, setLabel] = useState("")
  const [confirm, setConfirm] = useState<AnimalMedia | null>(null)
  const [editing, setEditing] = useState<AnimalMedia | null>(null)
  const [editLabel, setEditLabel] = useState("")
  const multiResearch = researches.length > 1

  // Pesquisa dona do arquivo. O padrão é a primeira do PRÓPRIO escopo — num indivíduo
  // compartilhado, a primária costuma ser de outro projeto, e enviar por ela responderia 403.
  const myResearchQ = useResearchList()
  const defaultResearchId = useMemo(() => {
    const mine = new Set((myResearchQ.data ?? []).map((r) => r.id))
    return (researches.find((r) => mine.has(r.id)) ?? researches[0])?.id ?? ""
  }, [myResearchQ.data, researches])
  const [researchId, setResearchId] = useState("")
  const ownerResearchId = researchId || defaultResearchId

  async function upload() {
    if (!file) return
    const body = new FormData()
    body.append("file", file)
    if (label.trim()) body.append("label", label.trim())
    if (ownerResearchId) body.append("researchId", ownerResearchId)
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

  function openEdit(m: AnimalMedia) {
    setEditing(m)
    setEditLabel(m.label ?? "")
  }

  async function saveLabel() {
    if (!editing) return
    try {
      await updateM.mutateAsync({ mediaId: editing.id, label: editLabel.trim() || null })
      toast.success(t("labelSaved"))
      setEditing(null)
    } catch (err) {
      toast.error(t("labelSaveError"), { description: em(err) })
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
  // Espelha a rota: admin do grupo, quem enviou, ou qualquer um se o arquivo não tem autor.
  const canDelete = (m: AnimalMedia) =>
    canDeleteAuthored({ isOrgAdmin, selfId, authorId: m.uploadedById })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
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
            maxLength={LIMITS.longText}
            className="max-w-xs"
          />
        </div>
        {multiResearch && (
          <div className="space-y-1">
            <Label htmlFor="media-research" className="text-xs text-muted-foreground">
              {t("research")}
            </Label>
            <Select value={ownerResearchId} onValueChange={setResearchId}>
              <SelectTrigger id="media-research" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {researches.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button onClick={upload} disabled={!file} loading={uploadM.isPending}>
          <Upload className="size-4" />
          {t("upload")}
        </Button>
        <p className="w-full text-xs text-muted-foreground">{t("allowedHint")}</p>
      </div>

      {loading ? (
        <TableSkeleton rows={3} />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-4 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
          {items.map((m) => {
            const isImage = m.mimeType.startsWith("image/")
            return (
              <div
                key={m.id}
                className="group relative overflow-hidden rounded-xl border bg-card shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-hover"
              >
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
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {fmtDate(m.createdAt)}
                    </p>
                    {multiResearch && (
                      <p
                        className="mt-0.5 truncate text-[10px] text-muted-foreground"
                        title={m.research.name}
                      >
                        {m.research.name}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => openEdit(m)}
                    >
                      <Pencil className="size-4" />
                      <span className="sr-only">{t("editLabel")}</span>
                    </Button>
                    {canDelete(m) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive"
                        onClick={() => setConfirm(m)}
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">{tc("delete")}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dirty={!!editing && editLabel !== (editing.label ?? "")}>
          <DialogHeader>
            <DialogTitle>{t("editLabel")}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-1">
            <Label htmlFor="media-label">{t("label")}</Label>
            <Input
              id="media-label"
              value={editLabel}
              placeholder={t("labelPlaceholder")}
              maxLength={LIMITS.longText}
              onChange={(e) => setEditLabel(e.target.value)}
            />
            <CharCounter value={editLabel} max={LIMITS.longText} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={saveLabel} loading={updateM.isPending}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
