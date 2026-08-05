"use client"

import { useMemo, useRef, useState, type FormEvent } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal, Plus, Search, X } from "lucide-react"

import { txt } from "@/lib/catalog-i18n"
import { formatDateOnly } from "@/lib/date"
import { LIMITS } from "@/schemas/limits"
import { useErrorMessage } from "@/lib/use-error-message"
import { type SamplePayload } from "@/services/samples"
import { useSamples, useCreateSample, useUpdateSample, useDeleteSample } from "@/hooks/use-samples"
import { useOrgans } from "@/hooks/use-catalog"
import { useResearch } from "@/hooks/use-research"
import type { Sample, SampleStatus } from "@/types/sample"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import {
  SampleStatusBadge,
  SampleStatusIcon,
  SAMPLE_STATUSES,
  useSampleStatusLabel,
} from "@/components/sample-status-badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CharCounter } from "@/components/ui/char-counter"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Truncate } from "@/components/ui/truncate"
import { ReloadButton } from "@/components/ui/reload-button"
import {
  Dialog,
  DialogBody,
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
  researchId: string
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
  researchId: "",
  organId: "",
  identification: "",
  sampleType: "",
  collectionDate: "",
  storageLocation: "",
  storageTemp: "",
  status: "STORED",
  notes: "",
}

const ALL = "__all__"

export function SamplesTab({
  animalId,
  isOrgAdmin,
  selfId,
  researches,
}: {
  animalId: string
  isOrgAdmin: boolean
  selfId: string
  // Pesquisas do indivíduo (primária + participações). A amostra pertence a uma delas.
  researches: { id: string; name: string }[]
}) {
  const t = useTranslations("samples")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const locale = useLocale()
  const em = useErrorMessage()
  const statusLabel = useSampleStatusLabel()

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
  const initialForm = useRef<FormState>(emptyForm)
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm.current)
  const [errors, setErrors] = useState<{
    organId?: boolean
    identification?: boolean
    sampleType?: boolean
  }>({})
  const [confirm, setConfirm] = useState<Sample | null>(null)
  // Escotilha de escape: mostrar todos os órgãos (biobanco/coleta oportunista além do protocolo).
  const [showAllOrgans, setShowAllOrgans] = useState(false)
  const multiResearch = researches.length > 1

  // Órgãos oferecidos no formulário: por padrão, apenas os do protocolo da pesquisa dona da
  // amostra. O detalhe da pesquisa (com `protocols`) é buscado só quando o diálogo está aberto.
  const detailQ = useResearch(form.researchId, !!dialog && !!form.researchId)
  const hasProtocol = (detailQ.data?.protocols?.length ?? 0) > 0
  const filteredByProtocol = hasProtocol && !showAllOrgans
  const organChoices = useMemo(() => {
    const protocolOrgans = new Map(
      (detailQ.data?.protocols ?? []).map((p) => [p.organ.id, p.organ] as const),
    )
    // Filtra pelo protocolo, salvo quando o usuário optou por ver todos ou não há protocolo.
    const base = filteredByProtocol ? [...protocolOrgans.values()] : organs
    // Preserva o órgão já selecionado (edição) mesmo que ele tenha saído do protocolo.
    if (form.organId && !base.some((o) => o.id === form.organId)) {
      const current = organs.find((o) => o.id === form.organId)
      if (current) return [...base, current]
    }
    return base
  }, [detailQ.data, organs, form.organId, filteredByProtocol])

  // ── Filtros da listagem ──
  const [query, setQuery] = useState("")
  const [fStatus, setFStatus] = useState(ALL)
  const [fOrgan, setFOrgan] = useState(ALL)
  const [fResearch, setFResearch] = useState(ALL)

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  function openCreate() {
    setErrors({})
    setShowAllOrgans(false)
    // Amostra nova pertence à pesquisa primária por padrão (researches[0]); o seletor só
    // aparece quando há mais de uma pesquisa no indivíduo.
    const init = { ...emptyForm, researchId: researches[0]?.id ?? "" }
    setForm(init)
    initialForm.current = init
    setDialog({ mode: "create" })
  }
  function openEdit(row: Sample) {
    setErrors({})
    setShowAllOrgans(false)
    const init: FormState = {
      researchId: row.research.id,
      organId: row.organ.id,
      identification: row.identification,
      sampleType: row.sampleType,
      collectionDate: row.collectionDate ? row.collectionDate.slice(0, 10) : "",
      storageLocation: row.storageLocation ?? "",
      storageTemp: row.storageTemp?.toString() ?? "",
      status: row.status,
      notes: row.notes ?? "",
    }
    setForm(init)
    initialForm.current = init
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
      researchId: form.researchId,
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

  const fmtDate = (iso: string | null) => formatDateOnly(iso, locale)
  // Espelha a rota: admin do grupo, ou quem cadastrou a amostra.
  const canDelete = (s: Sample) => isOrgAdmin || s.createdById === selfId

  // Opções de órgão e pesquisa derivadas das amostras existentes (ordenadas por rótulo).
  const organOptions = [
    ...new Map(items.map((s) => [s.organ.id, txt(locale, s.organ.name)])).entries(),
  ]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, locale))
  const researchFilterOptions = [
    ...new Map(items.map((s) => [s.research.id, s.research.name])).entries(),
  ]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, locale))

  const search = query.trim().toLowerCase()
  const filtered = items.filter((s) => {
    if (fStatus !== ALL && s.status !== fStatus) return false
    if (fOrgan !== ALL && s.organ.id !== fOrgan) return false
    if (fResearch !== ALL && s.research.id !== fResearch) return false
    if (search) {
      const haystack = [
        s.identification,
        s.sampleType,
        txt(locale, s.organ.name),
        s.storageLocation ?? "",
        s.research.name,
      ]
        .join(" ")
        .toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })

  const hasFilters = query !== "" || fStatus !== ALL || fOrgan !== ALL || fResearch !== ALL
  const clearFilters = () => {
    setQuery("")
    setFStatus(ALL)
    setFOrgan(ALL)
    setFResearch(ALL)
  }
  const colCount = multiResearch ? 10 : 9

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          {t("new")}
        </Button>
      </div>

      {loading ? (
        <TableSkeleton rows={3} />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          {/* Barra de filtros */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-9 pl-9"
              />
            </div>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="h-9 w-auto min-w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
                {SAMPLE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className="flex items-center gap-2">
                      <SampleStatusIcon status={s} />
                      {statusLabel(s)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {organOptions.length > 1 && (
              <Select value={fOrgan} onValueChange={setFOrgan}>
                <SelectTrigger className="h-9 w-auto min-w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("allOrgans")}</SelectItem>
                  {organOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {multiResearch && researchFilterOptions.length > 1 && (
              <Select value={fResearch} onValueChange={setFResearch}>
                <SelectTrigger className="h-9 w-auto min-w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("allResearch")}</SelectItem>
                  {researchFilterOptions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="size-3.5" />
                {t("clearFilters")}
              </Button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-md border [&>div]:h-full">
            <Table>
              <TableHeader className="sticky top-0 z-10 [&_th]:bg-accent">
                <TableRow>
                  <TableHead>{t("colIdentification")}</TableHead>
                  {multiResearch && <TableHead>{t("colResearch")}</TableHead>}
                  <TableHead>{t("colOrgan")}</TableHead>
                  <TableHead>{t("colType")}</TableHead>
                  <TableHead>{t("colCollection")}</TableHead>
                  <TableHead>{t("colStorage")}</TableHead>
                  <TableHead className="text-right">{t("colTemp")}</TableHead>
                  <TableHead className="text-center">{t("colStatus")}</TableHead>
                  <TableHead className="text-right">{t("colAnalyses")}</TableHead>
                  <TableHead className="w-12 text-right">
                    <ReloadButton />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableEmpty colSpan={colCount}>{tc("noResults")}</TableEmpty>
                )}
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Truncate>{s.identification}</Truncate>
                    </TableCell>
                    {multiResearch && (
                      <TableCell>
                        <Truncate lines={2} className="max-w-[10rem]">
                          {s.research.name}
                        </Truncate>
                      </TableCell>
                    )}
                    <TableCell>
                      <Truncate>{txt(locale, s.organ.name)}</Truncate>
                    </TableCell>
                    <TableCell>
                      <Truncate>{s.sampleType}</Truncate>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(s.collectionDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <Truncate>{s.storageLocation ?? ""}</Truncate>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {s.storageTemp ?? ""}
                    </TableCell>
                    <TableCell className="text-center">
                      <SampleStatusBadge status={s.status} iconOnly />
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
                          <DropdownMenuItem onSelect={() => openEdit(s)}>
                            {tc("edit")}
                          </DropdownMenuItem>
                          {canDelete(s) && (
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
        </>
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
        <DialogContent dirty={isDirty}>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? t("editTitle") : t("addTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
            <DialogBody className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="identification">{t("identification")}</Label>
                <Input
                  id="identification"
                  name="sampleIdentification"
                  autoComplete="on"
                  placeholder={t("identificationPlaceholder")}
                  maxLength={LIMITS.name}
                  value={form.identification}
                  onChange={(e) => set({ identification: e.target.value })}
                />
                {errors.identification && (
                  <p className="text-xs text-destructive">{tval("required")}</p>
                )}
              </div>
              {multiResearch && (
                <div className="space-y-1">
                  <Label htmlFor="sample-research">{t("research")}</Label>
                  <Select
                    value={form.researchId}
                    // Trocar a pesquisa reinicia o órgão e reaplica o filtro do protocolo.
                    onValueChange={(v) => {
                      set({ researchId: v, organId: "" })
                      setShowAllOrgans(false)
                    }}
                    disabled={dialog?.mode === "edit"}
                  >
                    <SelectTrigger id="sample-research">
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
                  {dialog?.mode === "edit" && (
                    <p className="text-xs text-muted-foreground">{t("researchLockedHint")}</p>
                  )}
                </div>
              )}
              {/* Órgão em linha própria: rótulo à esquerda e a escotilha do filtro à direita. */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="organ">{t("organ")}</Label>
                  {hasProtocol && (
                    <button
                      type="button"
                      className="text-xs font-medium text-accent-foreground underline underline-offset-2"
                      onClick={() => setShowAllOrgans((v) => !v)}
                    >
                      {filteredByProtocol ? t("organShowAll") : t("organShowProtocol")}
                    </button>
                  )}
                </div>
                <Combobox
                  options={organChoices.map((o) => ({ value: o.id, label: txt(locale, o.name) }))}
                  value={form.organId}
                  onChange={(v) => set({ organId: v })}
                  placeholder={t("organPlaceholder")}
                  searchPlaceholder={tc("search")}
                  emptyText={filteredByProtocol ? t("organProtocolEmpty") : tc("noResults")}
                />
                {hasProtocol && (
                  <p className="text-xs text-muted-foreground">
                    {filteredByProtocol ? t("organProtocolHint") : t("organAllHint")}
                  </p>
                )}
                {errors.organId && <p className="text-xs text-destructive">{tval("required")}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="sampleType">{t("sampleType")}</Label>
                  <Input
                    id="sampleType"
                    name="sampleType"
                    autoComplete="on"
                    placeholder={t("sampleTypePlaceholder")}
                    maxLength={LIMITS.name}
                    value={form.sampleType}
                    onChange={(e) => set({ sampleType: e.target.value })}
                  />
                  {errors.sampleType && (
                    <p className="text-xs text-destructive">{tval("required")}</p>
                  )}
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
                      {SAMPLE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          <span className="flex items-center gap-2">
                            <SampleStatusIcon status={s} />
                            {statusLabel(s)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                    name="sampleStorageTemp"
                    autoComplete="on"
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
                  name="sampleStorageLocation"
                  autoComplete="on"
                  maxLength={LIMITS.name}
                  value={form.storageLocation}
                  onChange={(e) => set({ storageLocation: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="notes">{t("notes")}</Label>
                  <CharCounter value={form.notes} max={LIMITS.longText} />
                </div>
                <Textarea
                  id="notes"
                  rows={2}
                  maxLength={LIMITS.longText}
                  value={form.notes}
                  onChange={(e) => set({ notes: e.target.value })}
                />
              </div>
            </DialogBody>
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
