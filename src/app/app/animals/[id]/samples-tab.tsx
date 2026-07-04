"use client"

import { useState, type FormEvent } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal, Plus } from "lucide-react"

import { txt } from "@/lib/catalog-i18n"
import { useErrorMessage } from "@/lib/use-error-message"
import { type SamplePayload } from "@/services/samples"
import { useSamples, useCreateSample, useUpdateSample, useDeleteSample } from "@/hooks/use-samples"
import { useOrgans } from "@/hooks/use-catalog"
import type { Sample, SampleStatus } from "@/types/sample"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type FormState = {
  organId: string
  identification: string
  sampleType: string
  collectionDate: string
  storageLocation: string
  storageTemp: string
  status: SampleStatus
  notes: string
}

const emptyForm: FormState = {
  organId: "",
  identification: "",
  sampleType: "",
  collectionDate: "",
  storageLocation: "",
  storageTemp: "",
  status: "STORED",
  notes: "",
}

const STATUSES: SampleStatus[] = ["STORED", "IN_USE", "DEPLETED", "DEGRADED"]
const statusVariant: Record<SampleStatus, "default" | "secondary" | "destructive" | "outline"> = {
  STORED: "secondary",
  IN_USE: "default",
  DEPLETED: "outline",
  DEGRADED: "destructive",
}

export function SamplesTab({ animalId, isOrgAdmin }: { animalId: string; isOrgAdmin: boolean }) {
  const t = useTranslations("samples")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const locale = useLocale()
  const em = useErrorMessage()

  const samplesQ = useSamples(animalId)
  const items = samplesQ.data ?? []
  const { data: organs = [] } = useOrgans()
  const loading = samplesQ.isLoading
  const createM = useCreateSample(animalId)
  const updateM = useUpdateSample(animalId)
  const deleteM = useDeleteSample(animalId)
  const saving = createM.isPending || updateM.isPending
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; row?: Sample } | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<{
    organId?: boolean
    identification?: boolean
    sampleType?: boolean
  }>({})
  const [confirm, setConfirm] = useState<Sample | null>(null)

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))
  const statusLabel = (s: SampleStatus) =>
    ({
      STORED: t("statusStored"),
      IN_USE: t("statusInUse"),
      DEPLETED: t("statusDepleted"),
      DEGRADED: t("statusDegraded"),
    })[s]

  function openCreate() {
    setErrors({})
    setForm(emptyForm)
    setDialog({ mode: "create" })
  }
  function openEdit(row: Sample) {
    setErrors({})
    setForm({
      organId: row.organ.id,
      identification: row.identification,
      sampleType: row.sampleType,
      collectionDate: row.collectionDate ? row.collectionDate.slice(0, 10) : "",
      storageLocation: row.storageLocation ?? "",
      storageTemp: row.storageTemp?.toString() ?? "",
      status: row.status,
      notes: row.notes ?? "",
    })
    setDialog({ mode: "edit", row })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const nextErrors = {
      organId: !form.organId,
      identification: !form.identification.trim(),
      sampleType: !form.sampleType.trim(),
    }
    setErrors(nextErrors)
    if (nextErrors.organId || nextErrors.identification || nextErrors.sampleType) return

    const orNull = (v: string) => (v.trim() === "" ? null : v.trim())
    const payload: SamplePayload = {
      organId: form.organId,
      identification: form.identification.trim(),
      sampleType: form.sampleType.trim(),
      collectionDate: orNull(form.collectionDate),
      storageLocation: orNull(form.storageLocation),
      storageTemp: form.storageTemp.trim() === "" ? null : Number(form.storageTemp),
      status: form.status,
      notes: orNull(form.notes),
    }
    const isEdit = dialog?.mode === "edit"
    try {
      if (isEdit) await updateM.mutateAsync({ id: dialog!.row!.id, data: payload })
      else await createM.mutateAsync(payload)
      toast.success(isEdit ? t("updated") : t("created"))
      setDialog(null)
    } catch (err) {
      toast.error(isEdit ? t("updateError") : t("createError"), { description: em(err) })
    }
  }

  async function remove(row: Sample) {
    try {
      await deleteM.mutateAsync(row.id)
      toast.success(t("deleted"))
    } catch (err) {
      toast.error(t("deleteError"), { description: em(err) })
    }
  }

  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale) : "")

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          {t("new")}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{tc("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colIdentification")}</TableHead>
                <TableHead>{t("colOrgan")}</TableHead>
                <TableHead>{t("colType")}</TableHead>
                <TableHead>{t("colCollection")}</TableHead>
                <TableHead>{t("colStorage")}</TableHead>
                <TableHead className="text-right">{t("colTemp")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead className="text-right">{t("colAnalyses")}</TableHead>
                <TableHead className="w-12 text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.identification}</TableCell>
                  <TableCell>{txt(locale, s.organ.name)}</TableCell>
                  <TableCell>{s.sampleType}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(s.collectionDate)}</TableCell>
                  <TableCell className="text-muted-foreground">{s.storageLocation ?? ""}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {s.storageTemp ?? ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[s.status]}>{statusLabel(s.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{s._count.analyses}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">{tc("actions")}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEdit(s)}>{tc("edit")}</DropdownMenuItem>
                        {isOrgAdmin && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setConfirm(s)}
                          >
                            {tc("delete")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? t("editTitle") : t("addTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="identification">{t("identification")}</Label>
              <Input
                id="identification"
                placeholder={t("identificationPlaceholder")}
                value={form.identification}
                onChange={(e) => set({ identification: e.target.value })}
              />
              {errors.identification && (
                <p className="text-xs text-destructive">{tval("required")}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="organ">{t("organ")}</Label>
                <Select value={form.organId} onValueChange={(v) => set({ organId: v })}>
                  <SelectTrigger id="organ">
                    <SelectValue placeholder={t("organPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {organs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {txt(locale, o.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.organId && <p className="text-xs text-destructive">{tval("required")}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="status">{t("status")}</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => set({ status: v as SampleStatus })}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sampleType">{t("sampleType")}</Label>
              <Input
                id="sampleType"
                placeholder={t("sampleTypePlaceholder")}
                value={form.sampleType}
                onChange={(e) => set({ sampleType: e.target.value })}
              />
              {errors.sampleType && <p className="text-xs text-destructive">{tval("required")}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="collectionDate">{t("collectionDate")}</Label>
                <Input
                  id="collectionDate"
                  type="date"
                  value={form.collectionDate}
                  onChange={(e) => set({ collectionDate: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="storageTemp">{t("storageTemp")}</Label>
                <Input
                  id="storageTemp"
                  type="number"
                  step="any"
                  value={form.storageTemp}
                  onChange={(e) => set({ storageTemp: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="storageLocation">{t("storageLocation")}</Label>
              <Input
                id="storageLocation"
                value={form.storageLocation}
                onChange={(e) => set({ storageLocation: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="notes">{t("notes")}</Label>
              <Textarea
                id="notes"
                rows={2}
                value={form.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" loading={saving}>
                {tc("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
