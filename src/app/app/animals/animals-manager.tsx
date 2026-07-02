"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal, Plus, Search } from "lucide-react"

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
import { WormsSpeciesInput } from "@/components/worms-species-input"
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

type AnimalRow = {
  id: string
  controlId: string | null
  simbaRecordNumber: string | null
  species: string
  sex: string | null
  lifeStage: string | null
  municipality: string | null
  state: string | null
  eventDate: string | null
  isPublic: boolean
  research: { id: string; name: string }
  _count: { samples: number }
}

type ResearchLite = { id: string; name: string }

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

export function AnimalsManager({ isOrgAdmin }: { isOrgAdmin: boolean }) {
  const t = useTranslations("animals")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const locale = useLocale()
  const em = useErrorMessage()

  const [items, setItems] = useState<AnimalRow[]>([])
  const [researches, setResearches] = useState<ResearchLite[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; id?: string } | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<{ species?: boolean; researchId?: boolean }>({})
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<AnimalRow | null>(null)
  const [fetchingSimba, setFetchingSimba] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [aRes, rRes] = await Promise.all([fetch("/api/animals"), fetch("/api/research")])
    if (aRes.ok) setItems(await aRes.json())
    if (rRes.ok) {
      const list: { id: string; name: string }[] = await rRes.json()
      setResearches(list.map((r) => ({ id: r.id, name: r.name })))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

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
    const res = await fetch(`/api/simba?record_number=${encodeURIComponent(rec)}`)
    setFetchingSimba(false)
    if (!res.ok) {
      toast.error(t("simbaFetchError"), { description: em(await res.json().catch(() => ({}))) })
      return
    }
    const d = await res.json()
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
  }

  function openEdit(a: AnimalRow) {
    setErrors({})
    // Carrega os campos completos do animal para edição.
    fetch(`/api/animals/${a.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((full) => {
        if (!full) return
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
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const isEdit = dialog?.mode === "edit"
    const nextErrors = {
      species: !form.species.trim(),
      researchId: !isEdit && !form.researchId,
    }
    setErrors(nextErrors)
    if (nextErrors.species || nextErrors.researchId) return

    // Constrói o payload; "" -> null (limpa), exceto obrigatórios.
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

    setSaving(true)
    const res = await fetch(isEdit ? `/api/animals/${dialog!.id}` : "/api/animals", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(isEdit ? t("updateError") : t("createError"), {
        description: em(await res.json().catch(() => ({}))),
      })
      return
    }
    toast.success(isEdit ? t("updated") : t("created"))
    setDialog(null)
    load()
  }

  async function remove(a: AnimalRow) {
    const res = await fetch(`/api/animals/${a.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error(t("deleteError"), { description: em(await res.json().catch(() => ({}))) })
      return
    }
    toast.success(t("deleted"))
    setItems((prev) => prev.filter((x) => x.id !== a.id))
  }

  const controlOf = (a: AnimalRow) => a.controlId ?? a.simbaRecordNumber ?? ""
  const locationOf = (a: AnimalRow) => [a.municipality, a.state].filter(Boolean).join(", ")
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
                    <SelectTrigger id="research">
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
                {errors.researchId && (
                  <p className="text-xs text-destructive">{tval("required")}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="species">{t("species")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="species"
                    className="italic"
                    value={form.species}
                    onChange={(e) =>
                      // Edição manual desvincula do registro WoRMS.
                      set({ species: e.target.value, wormsAphiaId: "" })
                    }
                  />
                  <WormsSpeciesInput
                    onSelect={(m) =>
                      set({
                        species: m.scientificName,
                        wormsAphiaId: String(m.aphiaId),
                        taxonFamily: m.family ?? "",
                        taxonOrder: m.order ?? "",
                      })
                    }
                  />
                </div>
                {errors.species && <p className="text-xs text-destructive">{tval("required")}</p>}
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
                    onChange={(e) => set({ controlId: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="simba">{t("simbaRecordNumber")}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="simba"
                      value={form.simbaRecordNumber}
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
                    onChange={(e) => set({ eventDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="beach">{t("strandingBeach")}</Label>
                  <Input
                    id="beach"
                    value={form.strandingBeach}
                    onChange={(e) => set({ strandingBeach: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="municipality">{t("municipality")}</Label>
                  <Input
                    id="municipality"
                    value={form.municipality}
                    onChange={(e) => set({ municipality: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="state">{t("state")}</Label>
                  <Input
                    id="state"
                    value={form.state}
                    onChange={(e) => set({ state: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lat">{t("strandingLat")}</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="any"
                    value={form.strandingLat}
                    onChange={(e) => set({ strandingLat: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lon">{t("strandingLon")}</Label>
                  <Input
                    id="lon"
                    type="number"
                    step="any"
                    value={form.strandingLon}
                    onChange={(e) => set({ strandingLon: e.target.value })}
                  />
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
                    <SelectTrigger id="sex">
                      <SelectValue placeholder={t("sexPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">{t("sexMale")}</SelectItem>
                      <SelectItem value="F">{t("sexFemale")}</SelectItem>
                      <SelectItem value="U">{t("sexUndetermined")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lifeStage">{t("lifeStage")}</Label>
                  <Input
                    id="lifeStage"
                    value={form.lifeStage}
                    onChange={(e) => set({ lifeStage: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bodyCondition">{t("bodyCondition")}</Label>
                  <Input
                    id="bodyCondition"
                    value={form.bodyCondition}
                    onChange={(e) => set({ bodyCondition: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="decomp">{t("decompositionStage")}</Label>
                  <Input
                    id="decomp"
                    value={form.decompositionStage}
                    onChange={(e) => set({ decompositionStage: e.target.value })}
                  />
                </div>
              </div>
            </section>

            {/* Observações */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t("sectionNotes")}</h3>
              <div className="space-y-1">
                <Label htmlFor="notes">{t("macroscopicNotes")}</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={form.macroscopicNotes}
                  onChange={(e) => set({ macroscopicNotes: e.target.value })}
                />
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
