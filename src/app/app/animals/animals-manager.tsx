"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal, Plus, Search } from "lucide-react"

import { createAnimalSchema, updateAnimalSchema, type CreateAnimalData } from "@/schemas/animal.schema"
import { animalsService } from "@/services/animals"
import { useAnimals } from "@/hooks/use-animals"
import { useResearchList } from "@/hooks/use-research"
import type { AnimalListItem } from "@/types/animal"
import { useErrorMessage } from "@/lib/use-error-message"
import { useTable } from "@/lib/use-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SortableHead } from "@/components/ui/sortable-head"
import { SpeciesAutocomplete } from "@/components/species-autocomplete"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

// Estado do formulário — tudo string (inputs controlados); convertido no submit.
type FormState = {
  researchId: string
  species: string
  wormsAphiaId: string
  taxonFamily: string
  taxonOrder: string
  controlId: string
  simbaRecordNumber: string
  sex: string
  lifeStage: string
  bodyCondition: string
  decompositionStage: string
  strandingLat: string
  strandingLon: string
  strandingBeach: string
  municipality: string
  state: string
  eventDate: string
  macroscopicNotes: string
  isPublic: boolean
}

const emptyForm: FormState = {
  researchId: "",
  species: "",
  wormsAphiaId: "",
  taxonFamily: "",
  taxonOrder: "",
  controlId: "",
  simbaRecordNumber: "",
  sex: "",
  lifeStage: "",
  bodyCondition: "",
  decompositionStage: "",
  strandingLat: "",
  strandingLon: "",
  strandingBeach: "",
  municipality: "",
  state: "",
  eventDate: "",
  macroscopicNotes: "",
  isPublic: false,
}

// ISO -> YYYY-MM-DD para <input type="date">.
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "")

// Marcador visual "(opcional)" ao lado do rótulo de campos não obrigatórios.
function OptionalHint() {
  const tc = useTranslations("common")
  return <span className="font-normal text-muted-foreground">({tc("optional")})</span>
}

// Mensagem de erro de um campo (traduz a chave do namespace `validation`; se não for
// uma chave conhecida, mostra o texto como veio).
function FieldError({ msg }: { msg?: string }) {
  const tval = useTranslations("validation")
  if (!msg) return null
  return <p className="text-xs text-destructive">{tval.has(msg) ? tval(msg) : msg}</p>
}

export function AnimalsManager({ isOrgAdmin }: { isOrgAdmin: boolean }) {
  const t = useTranslations("animals")
  const tc = useTranslations("common")
  const locale = useLocale()
  const em = useErrorMessage()

  const animalsQ = useAnimals()
  const researchQ = useResearchList()
  const items = animalsQ.data ?? []
  const researches = (researchQ.data ?? []).map((r) => ({ id: r.id, name: r.name }))
  const loading = animalsQ.isLoading || researchQ.isLoading
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; id?: string } | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  // Erros de validação por campo: chave do campo -> chave de mensagem (namespace `validation`).
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<AnimalListItem | null>(null)
  const [fetchingSimba, setFetchingSimba] = useState(false)

  const set = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }))
    // Limpa o erro dos campos que estão sendo editados.
    setErrors((e) => {
      if (Object.keys(e).length === 0) return e
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k]
      return next
    })
  }

  function openCreate() {
    setErrors({})
    setForm({ ...emptyForm, researchId: researches.length === 1 ? researches[0].id : "" })
    setDialog({ mode: "create" })
  }

  // Busca o registro no SIMBA e pré-preenche o formulário (o usuário revisa e salva).
  async function fetchSimba() {
    const rec = form.simbaRecordNumber.trim()
    if (!rec) return
    setFetchingSimba(true)
    try {
      const d = await animalsService.lookupSimba(rec)
      set({
        simbaRecordNumber: d.simbaRecordNumber ?? rec,
        species: d.species ?? form.species,
        wormsAphiaId: d.wormsAphiaId?.toString() ?? "",
        taxonFamily: d.taxonFamily ?? "",
        taxonOrder: d.taxonOrder ?? "",
        sex: d.sex ?? "",
        lifeStage: d.lifeStage ?? "",
        strandingLat: d.strandingLat?.toString() ?? "",
        strandingLon: d.strandingLon?.toString() ?? "",
        strandingBeach: d.strandingBeach ?? "",
        municipality: d.municipality ?? "",
        state: d.state ?? "",
        eventDate: d.eventDate ? d.eventDate.slice(0, 10) : "",
      })
      toast.success(t("simbaFetched"))
    } catch (err) {
      toast.error(t("simbaFetchError"), { description: em(err) })
    } finally {
      setFetchingSimba(false)
    }
  }

  function openEdit(a: AnimalListItem) {
    setErrors({})
    // Carrega os campos completos do animal para edição.
    animalsService
      .get(a.id)
      .then((full) => {
        setForm({
          researchId: full.research.id,
          species: full.species ?? "",
          wormsAphiaId: full.wormsAphiaId?.toString() ?? "",
          taxonFamily: full.taxonFamily ?? "",
          taxonOrder: full.taxonOrder ?? "",
          controlId: full.controlId ?? "",
          simbaRecordNumber: full.simbaRecordNumber ?? "",
          sex: full.sex ?? "",
          lifeStage: full.lifeStage ?? "",
          bodyCondition: full.bodyCondition ?? "",
          decompositionStage: full.decompositionStage ?? "",
          strandingLat: full.strandingLat?.toString() ?? "",
          strandingLon: full.strandingLon?.toString() ?? "",
          strandingBeach: full.strandingBeach ?? "",
          municipality: full.municipality ?? "",
          state: full.state ?? "",
          eventDate: toDateInput(full.eventDate),
          macroscopicNotes: full.macroscopicNotes ?? "",
          isPublic: full.isPublic ?? false,
        })
        setDialog({ mode: "edit", id: a.id })
      })
      .catch(() => {
        // silencioso: falha ao carregar detalhe
      })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const isEdit = dialog?.mode === "edit"

    // Monta o payload; "" -> null (limpa), exceto obrigatórios.
    const orNull = (v: string) => (v.trim() === "" ? null : v.trim())
    const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v))
    const payload: Record<string, unknown> = {
      species: form.species.trim(),
      wormsAphiaId: form.wormsAphiaId.trim() === "" ? null : Number(form.wormsAphiaId),
      taxonFamily: orNull(form.taxonFamily),
      taxonOrder: orNull(form.taxonOrder),
      controlId: orNull(form.controlId),
      simbaRecordNumber: orNull(form.simbaRecordNumber),
      sex: orNull(form.sex),
      lifeStage: orNull(form.lifeStage),
      bodyCondition: orNull(form.bodyCondition),
      decompositionStage: orNull(form.decompositionStage),
      strandingLat: numOrNull(form.strandingLat),
      strandingLon: numOrNull(form.strandingLon),
      strandingBeach: orNull(form.strandingBeach),
      municipality: orNull(form.municipality),
      state: orNull(form.state),
      eventDate: orNull(form.eventDate),
      macroscopicNotes: orNull(form.macroscopicNotes),
    }
    if (isOrgAdmin) payload.isPublic = form.isPublic
    if (!isEdit) payload.researchId = form.researchId

    // Validação interna com o mesmo schema do servidor, antes do POST.
    const parsed = (isEdit ? updateAnimalSchema : createAnimalSchema).safeParse(payload)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "")
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setSaving(true)
    try {
      if (isEdit) await animalsService.update(dialog!.id!, parsed.data)
      else await animalsService.create(parsed.data as CreateAnimalData)
      toast.success(isEdit ? t("updated") : t("created"))
      setDialog(null)
      animalsQ.refetch()
    } catch (err) {
      toast.error(isEdit ? t("updateError") : t("createError"), { description: em(err) })
    } finally {
      setSaving(false)
    }
  }

  async function remove(a: AnimalListItem) {
    try {
      await animalsService.remove(a.id)
      toast.success(t("deleted"))
      animalsQ.refetch()
    } catch (err) {
      toast.error(t("deleteError"), { description: em(err) })
    }
  }

  const controlOf = (a: AnimalListItem) => a.controlId ?? a.simbaRecordNumber ?? ""
  const locationOf = (a: AnimalListItem) => [a.municipality, a.state].filter(Boolean).join(", ")
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale) : "")

  const table = useTable(items, {
    locale,
    initialSort: { key: "date", dir: "desc" },
    columns: {
      control: controlOf,
      species: (a) => a.species,
      sex: (a) => a.sex ?? "",
      lifeStage: (a) => a.lifeStage ?? "",
      location: locationOf,
      date: (a) => a.eventDate ?? "",
      research: (a) => a.research.name,
      samples: (a) => a._count.samples,
    },
    search: (a) =>
      [controlOf(a), a.species, a.sex ?? "", a.lifeStage ?? "", locationOf(a), a.research.name].join(
        " "
      ),
  })

  const noResearch = researches.length === 0

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={openCreate} disabled={noResearch}>
          <Plus className="size-4" />
          {t("new")}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{tc("loading")}</p>
      ) : noResearch ? (
        <p className="text-sm text-muted-foreground">{t("noResearch")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="space-y-3">
          <Input
            value={table.query}
            onChange={(e) => table.setQuery(e.target.value)}
            placeholder={tc("search")}
            className="max-w-sm"
          />
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead sortKey="control" sort={table.sort} onToggle={table.toggleSort}>
                    {t("colControl")}
                  </SortableHead>
                  <SortableHead sortKey="species" sort={table.sort} onToggle={table.toggleSort}>
                    {t("colSpecies")}
                  </SortableHead>
                  <SortableHead sortKey="sex" sort={table.sort} onToggle={table.toggleSort}>
                    {t("colSex")}
                  </SortableHead>
                  <SortableHead sortKey="location" sort={table.sort} onToggle={table.toggleSort}>
                    {t("colLocation")}
                  </SortableHead>
                  <SortableHead sortKey="date" sort={table.sort} onToggle={table.toggleSort}>
                    {t("colDate")}
                  </SortableHead>
                  <SortableHead sortKey="research" sort={table.sort} onToggle={table.toggleSort}>
                    {t("colResearch")}
                  </SortableHead>
                  <SortableHead
                    sortKey="samples"
                    sort={table.sort}
                    onToggle={table.toggleSort}
                    align="right"
                  >
                    {t("colSamples")}
                  </SortableHead>
                  <TableHead className="w-16 text-right">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                      {tc("noResults")}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.rows.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        <Link href={`/app/animals/${a.id}`} className="hover:underline">
                          {controlOf(a) || (
                            <span className="text-muted-foreground">{t("notInformed")}</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="italic">{a.species}</TableCell>
                      <TableCell className="text-muted-foreground">{a.sex ?? ""}</TableCell>
                      <TableCell className="text-muted-foreground">{locationOf(a)}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(a.eventDate)}</TableCell>
                      <TableCell className="text-muted-foreground">{a.research.name}</TableCell>
                      <TableCell className="text-right">{a._count.samples}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">{tc("actions")}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/app/animals/${a.id}`}>{t("view")}</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openEdit(a)}>
                              {tc("edit")}
                            </DropdownMenuItem>
                            {isOrgAdmin && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => setConfirm(a)}
                              >
                                {tc("delete")}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? t("editTitle") : t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-5">
            {/* Identificação */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t("sectionIdentification")}</h3>
              <div className="space-y-1">
                <Label htmlFor="research">{t("research")}</Label>
                {dialog?.mode === "edit" ? (
                  <Input
                    disabled
                    value={researches.find((r) => r.id === form.researchId)?.name ?? ""}
                  />
                ) : (
                  <Select value={form.researchId} onValueChange={(v) => set({ researchId: v })}>
                    <SelectTrigger id="research" aria-invalid={!!errors.researchId || undefined}>
                      <SelectValue placeholder={t("researchPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {researches.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <FieldError msg={errors.researchId} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="species">{t("species")}</Label>
                <SpeciesAutocomplete
                  id="species"
                  value={form.species}
                  invalid={!!errors.species}
                  onChange={(species, m) =>
                    m
                      ? set({
                          species: m.scientificName,
                          wormsAphiaId: String(m.aphiaId),
                          taxonFamily: m.family ?? "",
                          taxonOrder: m.order ?? "",
                        })
                      : // Edição manual desvincula do registro WoRMS.
                        set({ species, wormsAphiaId: "" })
                  }
                />
                <FieldError msg={errors.species} />
                {form.wormsAphiaId && (
                  <p className="text-xs text-muted-foreground">
                    {t("wormsLinked", {
                      aphiaId: form.wormsAphiaId,
                      taxon:
                        [form.taxonFamily, form.taxonOrder].filter(Boolean).join(" · ") ||
                        t("notInformed"),
                    })}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="controlId">{t("controlId")}</Label>
                  <Input
                    id="controlId"
                    value={form.controlId}
                    aria-invalid={!!errors.controlId || undefined}
                    onChange={(e) => set({ controlId: e.target.value })}
                  />
                  <FieldError msg={errors.controlId} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="simba">{t("simbaRecordNumber")}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="simba"
                      value={form.simbaRecordNumber}
                      aria-invalid={!!errors.simbaRecordNumber || undefined}
                      onChange={(e) => set({ simbaRecordNumber: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={fetchSimba}
                      loading={fetchingSimba}
                      disabled={!form.simbaRecordNumber.trim()}
                      title={t("simbaFetch")}
                    >
                      <Search className="size-4" />
                    </Button>
                  </div>
                  <FieldError msg={errors.simbaRecordNumber} />
                </div>
              </div>
            </section>

            {/* Encalhe */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t("sectionStranding")}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="eventDate">{t("eventDate")}</Label>
                  <Input
                    id="eventDate"
                    type="date"
                    value={form.eventDate}
                    aria-invalid={!!errors.eventDate || undefined}
                    onChange={(e) => set({ eventDate: e.target.value })}
                  />
                  <FieldError msg={errors.eventDate} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="beach">
                    {t("strandingBeach")} <OptionalHint />
                  </Label>
                  <Input
                    id="beach"
                    value={form.strandingBeach}
                    aria-invalid={!!errors.strandingBeach || undefined}
                    onChange={(e) => set({ strandingBeach: e.target.value })}
                  />
                  <FieldError msg={errors.strandingBeach} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="municipality">{t("municipality")}</Label>
                  <Input
                    id="municipality"
                    value={form.municipality}
                    aria-invalid={!!errors.municipality || undefined}
                    onChange={(e) => set({ municipality: e.target.value })}
                  />
                  <FieldError msg={errors.municipality} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="state">{t("state")}</Label>
                  <Input
                    id="state"
                    value={form.state}
                    aria-invalid={!!errors.state || undefined}
                    onChange={(e) => set({ state: e.target.value })}
                  />
                  <FieldError msg={errors.state} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lat">{t("strandingLat")}</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="any"
                    value={form.strandingLat}
                    aria-invalid={!!errors.strandingLat || undefined}
                    onChange={(e) => set({ strandingLat: e.target.value })}
                  />
                  <FieldError msg={errors.strandingLat} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lon">{t("strandingLon")}</Label>
                  <Input
                    id="lon"
                    type="number"
                    step="any"
                    value={form.strandingLon}
                    aria-invalid={!!errors.strandingLon || undefined}
                    onChange={(e) => set({ strandingLon: e.target.value })}
                  />
                  <FieldError msg={errors.strandingLon} />
                </div>
              </div>
            </section>

            {/* Condição */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t("sectionCondition")}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="sex">{t("sex")}</Label>
                  <Select
                    value={form.sex || undefined}
                    onValueChange={(v) => set({ sex: v })}
                  >
                    <SelectTrigger id="sex" aria-invalid={!!errors.sex || undefined}>
                      <SelectValue placeholder={t("sexPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">{t("sexMale")}</SelectItem>
                      <SelectItem value="F">{t("sexFemale")}</SelectItem>
                      <SelectItem value="U">{t("sexUndetermined")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError msg={errors.sex} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lifeStage">{t("lifeStage")}</Label>
                  <Input
                    id="lifeStage"
                    value={form.lifeStage}
                    aria-invalid={!!errors.lifeStage || undefined}
                    onChange={(e) => set({ lifeStage: e.target.value })}
                  />
                  <FieldError msg={errors.lifeStage} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bodyCondition">
                    {t("bodyCondition")} <OptionalHint />
                  </Label>
                  <Input
                    id="bodyCondition"
                    value={form.bodyCondition}
                    aria-invalid={!!errors.bodyCondition || undefined}
                    onChange={(e) => set({ bodyCondition: e.target.value })}
                  />
                  <FieldError msg={errors.bodyCondition} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="decomp">
                    {t("decompositionStage")} <OptionalHint />
                  </Label>
                  <Input
                    id="decomp"
                    value={form.decompositionStage}
                    aria-invalid={!!errors.decompositionStage || undefined}
                    onChange={(e) => set({ decompositionStage: e.target.value })}
                  />
                  <FieldError msg={errors.decompositionStage} />
                </div>
              </div>
            </section>

            {/* Observações */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t("sectionNotes")}</h3>
              <div className="space-y-1">
                <Label htmlFor="notes">
                  {t("macroscopicNotes")} <OptionalHint />
                </Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={form.macroscopicNotes}
                  aria-invalid={!!errors.macroscopicNotes || undefined}
                  onChange={(e) => set({ macroscopicNotes: e.target.value })}
                />
                <FieldError msg={errors.macroscopicNotes} />
              </div>
              {isOrgAdmin && (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="isPublic"
                    checked={form.isPublic}
                    onCheckedChange={(v) => set({ isPublic: v === true })}
                    className="mt-0.5"
                  />
                  <Label htmlFor="isPublic" className="text-sm font-normal text-muted-foreground">
                    {t("isPublicHint")}
                  </Label>
                </div>
              )}
            </section>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" loading={saving}>
                {dialog?.mode === "edit" ? tc("save") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
