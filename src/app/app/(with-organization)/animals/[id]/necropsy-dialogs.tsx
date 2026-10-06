"use client"

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { txt } from "@/lib/catalog-i18n"
import { LIMITS } from "@/schemas/limits"
import { useErrorMessage } from "@/lib/use-error-message"
import { DISTRIBUTION_OPTIONS, SEVERITY_OPTIONS } from "@/lib/necropsy-enums"
import type { DistributionValue, SeverityValue } from "@/lib/necropsy-enums"
import { useOrgans } from "@/hooks/use-catalog"
import {
  useCreateGrossFinding,
  useCreateHistopathology,
  useUpdateGrossFinding,
  useUpdateHistopathology,
} from "@/hooks/use-necropsy"
import type { GrossFinding, HistopathologyFinding } from "@/types/necropsy"
import type { GrossFindingPayload } from "@/services/necropsy"
import { TriState } from "./necropsy-tristate"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CharCounter } from "@/components/ui/char-counter"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Valor do Select que representa "sem valor": o Radix não aceita SelectItem com value="".
const NONE = "__none__"

// ── Diálogo: achado macroscópico ─────────────────────────────────────────────

type GrossFormState = {
  organId: string
  tissue: string
  site: string
  lesion: string
  distribution: string
  severity: string
  notes: string
  parasitesPresent: boolean | null
  parasitesCollected: boolean | null
  parasiteCount: string
}

const emptyGross: GrossFormState = {
  organId: "",
  tissue: "",
  site: "",
  lesion: "",
  distribution: NONE,
  severity: NONE,
  notes: "",
  parasitesPresent: null,
  parasitesCollected: null,
  parasiteCount: "",
}

export function GrossFindingDialog({
  animalId,
  systemId,
  systemLabel,
  row,
  nextPosition,
  open,
  onClose,
}: {
  animalId: string
  systemId: string
  systemLabel: string
  // Preenchido = edição; ausente = criação.
  row?: GrossFinding
  nextPosition: number
  open: boolean
  onClose: () => void
}) {
  const t = useTranslations("necropsy")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const em = useErrorMessage()
  const locale = useLocale()
  const { data: organs = [], isLoading: organsLoading } = useOrgans(open)
  const createM = useCreateGrossFinding(animalId)
  const updateM = useUpdateGrossFinding(animalId)
  const saving = createM.isPending || updateM.isPending

  const [form, setForm] = useState<GrossFormState>(emptyGross)
  const initial = useRef<GrossFormState>(emptyGross)
  const [errors, setErrors] = useState<{ lesion?: boolean }>({})
  const set = (patch: Partial<GrossFormState>) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => {
    if (!open) return
    const init: GrossFormState = row
      ? {
          organId: row.organ?.id ?? "",
          tissue: row.tissue ?? "",
          site: row.site ?? "",
          lesion: row.lesion,
          distribution: row.distribution ?? NONE,
          severity: row.severity ?? NONE,
          notes: row.notes ?? "",
          parasitesPresent: row.parasitesPresent,
          parasitesCollected: row.parasitesCollected,
          parasiteCount: row.parasiteCount?.toString() ?? "",
        }
      : emptyGross
    setForm(init)
    initial.current = init
    setErrors({})
  }, [open, row])

  const isDirty = JSON.stringify(form) !== JSON.stringify(initial.current)
  const position = row?.position ?? nextPosition

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    // Só a lesão é obrigatória: é ela que diz O QUE foi encontrado. A topografia inteira
    // pode faltar quando o achado é do sistema como um todo.
    const next = { lesion: !form.lesion.trim() }
    setErrors(next)
    if (next.lesion) return

    const payload: GrossFindingPayload = {
      organId: form.organId || null,
      tissue: form.tissue.trim() || null,
      site: form.site.trim() || null,
      lesion: form.lesion.trim(),
      distribution: form.distribution === NONE ? null : (form.distribution as DistributionValue),
      severity: form.severity === NONE ? null : (form.severity as SeverityValue),
      notes: form.notes.trim() || null,
      parasitesPresent: form.parasitesPresent,
      parasitesCollected: form.parasitesCollected,
      // Em branco é "não informado", não zero: zero afirma que se contou e não havia nenhum.
      parasiteCount: form.parasiteCount.trim() === "" ? null : Number(form.parasiteCount),
    }

    try {
      if (row) await updateM.mutateAsync({ id: row.id, data: payload })
      else await createM.mutateAsync({ systemId, data: payload })
      toast.success(row ? t("findingUpdated") : t("findingCreated"))
      onClose()
    } catch (err) {
      toast.error(row ? t("findingUpdateError") : t("findingCreateError"), {
        description: em(err),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dirty={isDirty} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{row ? t("editFindingTitle") : t("addFindingTitle")}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t("findingSubtitle", { system: systemLabel, position })}
          </p>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
          <DialogBody className="space-y-4">
            {/* Topografia dentro do sistema — o sistema já está no subtítulo do diálogo e
                por isso não se repete aqui. */}
            <fieldset className="space-y-3 rounded-xl border p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("topography")}
              </legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="finding-organ">{t("organ")}</Label>
                  <Combobox
                    options={organs.map((o) => ({ value: o.id, label: txt(locale, o.name) }))}
                    value={form.organId}
                    onChange={(v) => set({ organId: v })}
                    placeholder={t("organOptional")}
                    searchPlaceholder={tc("search")}
                    emptyText={tc("noResults")}
                    loading={organsLoading}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tissue">{t("tissue")}</Label>
                  <Input
                    id="tissue"
                    maxLength={LIMITS.microText}
                    placeholder={t("tissuePlaceholder")}
                    value={form.tissue}
                    onChange={(e) => set({ tissue: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="site">{t("site")}</Label>
                  <Input
                    id="site"
                    maxLength={LIMITS.microText}
                    placeholder={t("sitePlaceholder")}
                    value={form.site}
                    onChange={(e) => set({ site: e.target.value })}
                  />
                </div>
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="lesion">{t("colLesion")}</Label>
                <Input
                  id="lesion"
                  maxLength={LIMITS.name}
                  value={form.lesion}
                  onChange={(e) => set({ lesion: e.target.value })}
                />
                {errors.lesion && <p className="text-xs text-destructive">{tval("required")}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="distribution">{t("colDistribution")}</Label>
                  <Select value={form.distribution} onValueChange={(v) => set({ distribution: v })}>
                    <SelectTrigger id="distribution">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("notInformed")}</SelectItem>
                      {DISTRIBUTION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {t(o.key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="severity">{t("colSeverity")}</Label>
                  <Select value={form.severity} onValueChange={(v) => set({ severity: v })}>
                    <SelectTrigger id="severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("notInformed")}</SelectItem>
                      {SEVERITY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {t(o.key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="finding-notes">{t("colNotes")}</Label>
                <CharCounter value={form.notes} max={LIMITS.longText} />
              </div>
              <Textarea
                id="finding-notes"
                rows={4}
                maxLength={LIMITS.longText}
                value={form.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </div>

            <fieldset className="space-y-3 rounded-xl border bg-muted/30 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-accent-foreground">
                {t("parasites")}
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <TriState
                  id="parasites-present"
                  label={t("colParasitesPresent")}
                  value={form.parasitesPresent}
                  onChange={(v) => set({ parasitesPresent: v })}
                />
                <TriState
                  id="parasites-collected"
                  label={t("colParasitesCollected")}
                  value={form.parasitesCollected}
                  onChange={(v) =>
                    set({ parasitesCollected: v, ...(v === true ? {} : { parasiteCount: "" }) })
                  }
                />
                <div className="space-y-1.5">
                  <Label htmlFor="parasite-count">{t("colParasiteCount")}</Label>
                  {/* Contar o que não foi coletado é contradição; o schema recusa no
                      servidor, e aqui o campo simplesmente não abre. */}
                  <Input
                    id="parasite-count"
                    type="number"
                    min={0}
                    step={1}
                    disabled={form.parasitesCollected !== true}
                    placeholder={t("notInformed")}
                    value={form.parasiteCount}
                    onChange={(e) => set({ parasiteCount: e.target.value })}
                  />
                </div>
              </div>
            </fieldset>
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            <span className="hidden text-xs text-muted-foreground sm:block">
              {t("blankMeansUnknown")}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {tc("cancel")}
              </Button>
              <Button type="submit" loading={saving}>
                {tc("save")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Diálogo: achado histopatológico ──────────────────────────────────────────

export function HistopathologyDialog({
  animalId,
  row,
  open,
  onClose,
}: {
  animalId: string
  row?: HistopathologyFinding
  open: boolean
  onClose: () => void
}) {
  const t = useTranslations("necropsy")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const locale = useLocale()
  const em = useErrorMessage()
  const { data: organs = [], isLoading: organsLoading } = useOrgans(open)
  const createM = useCreateHistopathology(animalId)
  const updateM = useUpdateHistopathology(animalId)
  const saving = createM.isPending || updateM.isPending

  const [organId, setOrganId] = useState("")
  const [finding, setFinding] = useState("")
  const [errors, setErrors] = useState<{ organId?: boolean; finding?: boolean }>({})
  // Entrada em série: dez achados seguidos é o caso normal deste exame, então o diálogo
  // fica aberto por padrão e lista o que já entrou nesta sessão — o retorno visual que
  // substitui fechar e reabrir a cada linha.
  const [keepOpen, setKeepOpen] = useState(true)
  const [added, setAdded] = useState<{ organ: string; finding: string }[]>([])
  const findingRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    setOrganId(row?.organ.id ?? "")
    setFinding(row?.finding ?? "")
    setErrors({})
    setAdded([])
  }, [open, row])

  const isDirty = organId !== (row?.organ.id ?? "") || finding !== (row?.finding ?? "")
  const isEdit = !!row
  const serial = !isEdit && keepOpen

  async function submit() {
    const next = { organId: !organId, finding: !finding.trim() }
    setErrors(next)
    if (next.organId || next.finding) return

    const payload = { organId, finding: finding.trim() }
    try {
      if (row) {
        await updateM.mutateAsync({ id: row.id, data: payload })
        toast.success(t("histoUpdated"))
        onClose()
        return
      }
      const created = await createM.mutateAsync(payload)
      if (!serial) {
        toast.success(t("histoCreated"))
        onClose()
        return
      }
      // Sem toast por linha: a lista "adicionados agora" já confirma cada gravação, e dez
      // toasts empilhados atrapalhariam mais do que informam.
      setAdded((a) => [...a, { organ: txt(locale, created.organ.name), finding: created.finding }])
      setOrganId("")
      setFinding("")
      findingRef.current?.focus()
    } catch (err) {
      toast.error(row ? t("histoUpdateError") : t("histoCreateError"), { description: em(err) })
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dirty={isDirty}>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editHistoTitle") : t("addHistoTitle")}</DialogTitle>
          {!isEdit && added.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("histoAddedCount", { count: added.length })}
            </p>
          )}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <DialogBody className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="histo-organ">{t("organ")}</Label>
              <Combobox
                options={organs.map((o) => ({ value: o.id, label: txt(locale, o.name) }))}
                value={organId}
                onChange={(v) => setOrganId(v)}
                placeholder={t("organPlaceholder")}
                searchPlaceholder={tc("search")}
                emptyText={tc("noResults")}
                loading={organsLoading}
              />
              {errors.organId && <p className="text-xs text-destructive">{tval("required")}</p>}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="histo-finding">{t("finding")}</Label>
                <CharCounter value={finding} max={LIMITS.longText} />
              </div>
              <Textarea
                id="histo-finding"
                ref={findingRef}
                rows={4}
                maxLength={LIMITS.longText}
                placeholder={t("findingPlaceholder")}
                value={finding}
                onChange={(e) => setFinding(e.target.value)}
                onKeyDown={onKeyDown}
              />
              {errors.finding && <p className="text-xs text-destructive">{tval("required")}</p>}
            </div>

            {added.length > 0 && (
              <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("histoAddedNow")}
                </p>
                <ul className="space-y-1">
                  {added.map((a, i) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{a.organ}</span>: {a.finding}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            {isEdit ? (
              <span />
            ) : (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={keepOpen}
                  onCheckedChange={(v) => setKeepOpen(v === true)}
                  aria-label={t("keepOpen")}
                />
                {t("keepOpen")}
              </label>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {isEdit ? tc("cancel") : tc("close")}
              </Button>
              <Button type="submit" loading={saving}>
                {serial ? t("saveAndAdd") : tc("save")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
