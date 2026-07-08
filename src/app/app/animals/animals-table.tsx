"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { Download, Globe, Lock, MoreHorizontal, X } from "lucide-react"

import type { AnimalListItem } from "@/types/animal"
import { useTable } from "@/lib/use-table"
import { formatDateOnly } from "@/lib/date"
import { SEX_OPTIONS, LIFE_STAGE_OPTIONS } from "@/lib/animal-enums"
import { downloadAnimalsExport, type ExportFormat } from "@/lib/export-download"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ReloadButton } from "@/components/ui/reload-button"
import { SortableHead } from "@/components/ui/sortable-head"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const ALL = "__all__"

// Valores distintos, não-nulos, ordenados por locale — base das opções de filtro.
function distinctSorted(values: (string | null)[], locale: string): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) =>
    a.localeCompare(b, locale),
  )
}

// Tabela de animais: busca, ordenação e ações (ver/editar/excluir). O estado dos
// dados vive no AnimalsManager; aqui só apresentamos e sinalizamos ações.
export function AnimalsTable({
  items,
  isOrgAdmin,
  onEdit,
  onDelete,
}: {
  items: AnimalListItem[]
  isOrgAdmin: boolean
  onEdit: (a: AnimalListItem) => void
  onDelete: (a: AnimalListItem) => void
}) {
  const t = useTranslations("animals")
  const tc = useTranslations("common")
  const locale = useLocale()

  const controlOf = (a: AnimalListItem) => a.controlId ?? a.simbaRecordNumber ?? ""
  const locationOf = (a: AnimalListItem) => [a.municipality, a.state].filter(Boolean).join(", ")
  const fmtDate = (iso: string | null) => formatDateOnly(iso, locale)
  const sexLabel = (s: string | null) => {
    const o = SEX_OPTIONS.find((x) => x.value === s)
    return o ? t(o.key) : (s ?? "")
  }
  // Visibilidade pública EFETIVA: o animal só é público se ele E a pesquisa forem públicos.
  const isEffectivePublic = (a: AnimalListItem) => a.isPublic && a.research.isPublic
  // Explica no tooltip por que o animal aparece (ou não) no mapa público.
  const visibilityTooltip = (a: AnimalListItem) => {
    if (!a.research.isPublic) return t("visMapResearchPrivate")
    return a.isPublic ? t("visMapPublic") : t("visMapAnimalHidden")
  }

  // ── Filtros estruturados (multisseleção + selects), aplicados antes da busca/ordenação ──
  const [fSpecies, setFSpecies] = useState<string[]>([])
  const [fSex, setFSex] = useState<string[]>([])
  const [fLifeStage, setFLifeStage] = useState<string[]>([])
  const [fState, setFState] = useState<string[]>([])
  const [fResearch, setFResearch] = useState<string[]>([])
  const [fPathogen, setFPathogen] = useState<string[]>([])
  const [fVisibility, setFVisibility] = useState(ALL)
  const [fSamples, setFSamples] = useState(ALL)
  const [fFrom, setFFrom] = useState("")
  const [fTo, setFTo] = useState("")

  const speciesOptions = useMemo<MultiSelectOption[]>(
    () =>
      distinctSorted(
        items.map((a) => a.species),
        locale,
      ).map((s) => ({ value: s, label: s })),
    [items, locale],
  )
  const stateOptions = useMemo<MultiSelectOption[]>(
    () =>
      distinctSorted(
        items.map((a) => a.state),
        locale,
      ).map((s) => ({ value: s, label: s })),
    [items, locale],
  )
  const pathogenOptions = useMemo<MultiSelectOption[]>(
    () =>
      distinctSorted(
        items.flatMap((a) => a.positivePathogens),
        locale,
      ).map((p) => ({
        value: p,
        label: p,
      })),
    [items, locale],
  )
  const researchOptions = useMemo<MultiSelectOption[]>(() => {
    const map = new Map<string, string>()
    // Considera todas as pesquisas do indivíduo (primária + participações).
    for (const a of items) for (const r of a.researches) map.set(r.id, r.name)
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((x, y) => x.label.localeCompare(y.label, locale))
  }, [items, locale])
  const sexOptions = useMemo<MultiSelectOption[]>(() => {
    const present = new Set(items.map((a) => a.sex))
    return SEX_OPTIONS.filter((o) => present.has(o.value)).map((o) => ({
      value: o.value,
      label: t(o.key),
    }))
  }, [items, t])
  const lifeStageOptions = useMemo<MultiSelectOption[]>(() => {
    const present = new Set(items.map((a) => a.lifeStage))
    return LIFE_STAGE_OPTIONS.filter((o) => present.has(o.value)).map((o) => ({
      value: o.value,
      label: t(o.key),
    }))
  }, [items, t])

  const filteredItems = useMemo(
    () =>
      items.filter((a) => {
        if (fSpecies.length && !fSpecies.includes(a.species)) return false
        if (fSex.length && !(a.sex && fSex.includes(a.sex))) return false
        if (fLifeStage.length && !(a.lifeStage && fLifeStage.includes(a.lifeStage))) return false
        if (fState.length && !(a.state && fState.includes(a.state))) return false
        if (fResearch.length && !a.researches.some((r) => fResearch.includes(r.id))) return false
        if (fPathogen.length && !fPathogen.some((p) => a.positivePathogens.includes(p)))
          return false
        if (fVisibility === "public" && !isEffectivePublic(a)) return false
        if (fVisibility === "private" && isEffectivePublic(a)) return false
        if (fSamples === "with" && a._count.samples === 0) return false
        if (fSamples === "without" && a._count.samples > 0) return false
        if (fFrom && (!a.eventDate || a.eventDate < fFrom)) return false
        if (fTo && (!a.eventDate || a.eventDate > fTo)) return false
        return true
      }),
    [
      items,
      fSpecies,
      fSex,
      fLifeStage,
      fState,
      fResearch,
      fPathogen,
      fVisibility,
      fSamples,
      fFrom,
      fTo,
    ],
  )

  const hasFilters =
    fSpecies.length > 0 ||
    fSex.length > 0 ||
    fLifeStage.length > 0 ||
    fState.length > 0 ||
    fResearch.length > 0 ||
    fPathogen.length > 0 ||
    fVisibility !== ALL ||
    fSamples !== ALL ||
    fFrom !== "" ||
    fTo !== ""

  const clearFilters = () => {
    setFSpecies([])
    setFSex([])
    setFLifeStage([])
    setFState([])
    setFResearch([])
    setFPathogen([])
    setFVisibility(ALL)
    setFSamples(ALL)
    setFFrom("")
    setFTo("")
  }

  const table = useTable(filteredItems, {
    locale,
    initialSort: { key: "date", dir: "desc" },
    columns: {
      control: controlOf,
      species: (a) => a.species,
      sex: (a) => sexLabel(a.sex),
      lifeStage: (a) => a.lifeStage ?? "",
      location: locationOf,
      date: (a) => a.eventDate ?? "",
      research: (a) => a.research.name,
      isPublic: (a) => (isEffectivePublic(a) ? "1" : "0"),
      samples: (a) => a._count.samples,
    },
    search: (a) =>
      [
        controlOf(a),
        a.species,
        sexLabel(a.sex),
        a.lifeStage ?? "",
        locationOf(a),
        a.research.name,
      ].join(" "),
  })

  // Seleção para exportação (ids acumulados; a seleção "todos" age sobre as linhas filtradas).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const rowIds = table.rows.map((a) => a.id)
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id))
  const someSelected = rowIds.some((id) => selected.has(id))

  const toggleRow = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const toggleAll = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of rowIds) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  async function exportAs(format: ExportFormat) {
    if (selected.size === 0) return
    setExporting(true)
    try {
      await downloadAnimalsExport([...selected], format)
    } catch {
      toast.error(t("exportError"))
    } finally {
      setExporting(false)
    }
  }

  // Todos os campos de filtro têm a mesma largura (w-44); os controles preenchem o campo.
  const filterField = (label: string, control: React.ReactNode) => (
    <label className="flex w-44 flex-col gap-1 text-xs">
      <span className="font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {control}
    </label>
  )

  return (
    <div className="space-y-3">
      {/* Barra de filtros estruturados */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-card">
        {filterField(
          t("filterSpecies"),
          <div className="w-full">
            <MultiSelect
              options={speciesOptions}
              value={fSpecies}
              onChange={setFSpecies}
              placeholder={t("allSpecies")}
              searchPlaceholder={t("filterSpecies")}
              emptyText={tc("noResults")}
            />
          </div>,
        )}
        {sexOptions.length > 0 &&
          filterField(
            t("colSex"),
            <div className="w-full">
              <MultiSelect
                options={sexOptions}
                value={fSex}
                onChange={setFSex}
                placeholder={t("allSexes")}
                emptyText={tc("noResults")}
                searchable={false}
              />
            </div>,
          )}
        {lifeStageOptions.length > 0 &&
          filterField(
            t("colLifeStage"),
            <div className="w-full">
              <MultiSelect
                options={lifeStageOptions}
                value={fLifeStage}
                onChange={setFLifeStage}
                placeholder={t("allLifeStages")}
                emptyText={tc("noResults")}
                searchable={false}
              />
            </div>,
          )}
        {stateOptions.length > 0 &&
          filterField(
            t("filterState"),
            <div className="w-full">
              <MultiSelect
                options={stateOptions}
                value={fState}
                onChange={setFState}
                placeholder={t("allStates")}
                searchPlaceholder={t("filterState")}
                emptyText={tc("noResults")}
              />
            </div>,
          )}
        {researchOptions.length > 1 &&
          filterField(
            t("colResearch"),
            <div className="w-full">
              <MultiSelect
                options={researchOptions}
                value={fResearch}
                onChange={setFResearch}
                placeholder={t("allResearch")}
                searchPlaceholder={t("colResearch")}
                emptyText={tc("noResults")}
              />
            </div>,
          )}
        {pathogenOptions.length > 0 &&
          filterField(
            t("filterPathogen"),
            <div className="w-full">
              <MultiSelect
                options={pathogenOptions}
                value={fPathogen}
                onChange={setFPathogen}
                placeholder={t("allPathogens")}
                searchPlaceholder={t("filterPathogen")}
                emptyText={tc("noResults")}
              />
            </div>,
          )}
        {filterField(
          t("colVisibility"),
          <Select value={fVisibility} onValueChange={setFVisibility}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allVisibility")}</SelectItem>
              <SelectItem value="public">{t("public")}</SelectItem>
              <SelectItem value="private">{t("private")}</SelectItem>
            </SelectContent>
          </Select>,
        )}
        {filterField(
          t("filterSamples"),
          <Select value={fSamples} onValueChange={setFSamples}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allSamples")}</SelectItem>
              <SelectItem value="with">{t("withSamples")}</SelectItem>
              <SelectItem value="without">{t("withoutSamples")}</SelectItem>
            </SelectContent>
          </Select>,
        )}
        {filterField(
          t("filterFrom"),
          <Input
            type="date"
            value={fFrom}
            onChange={(e) => setFFrom(e.target.value)}
            className="h-9 w-full"
          />,
        )}
        {filterField(
          t("filterTo"),
          <Input
            type="date"
            value={fTo}
            onChange={(e) => setFTo(e.target.value)}
            className="h-9 w-full"
          />,
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="size-3.5" />
            {t("clearFilters")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={table.query}
          onChange={(e) => table.setQuery(e.target.value)}
          placeholder={tc("search")}
          className="max-w-sm"
        />
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t("selectedCount", { count: selected.size })}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" loading={exporting}>
                  <Download className="size-4" />
                  {t("export")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => exportAs("xlsx")}>
                  {t("exportExcel")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportAs("darwin-core")}>
                  {t("exportDarwin")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label={t("selectAll")}
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAll(v === true)}
                />
              </TableHead>
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
              <SortableHead sortKey="isPublic" sort={table.sort} onToggle={table.toggleSort}>
                {t("colVisibility")}
              </SortableHead>
              <SortableHead
                sortKey="samples"
                sort={table.sort}
                onToggle={table.toggleSort}
                align="right"
              >
                {t("colSamples")}
              </SortableHead>
              <TableHead className="w-16 text-right">
                <ReloadButton />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                  {tc("noResults")}
                </TableCell>
              </TableRow>
            ) : (
              table.rows.map((a) => (
                <TableRow key={a.id} data-state={selected.has(a.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      aria-label={t("selectRow")}
                      checked={selected.has(a.id)}
                      onCheckedChange={(v) => toggleRow(a.id, v === true)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/app/animals/${a.id}`} className="hover:underline">
                      {controlOf(a) || (
                        <span className="text-muted-foreground">{t("notInformed")}</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="italic">{a.species}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{sexLabel(a.sex)}</TableCell>
                  <TableCell className="text-muted-foreground">{locationOf(a)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(a.eventDate)}</TableCell>
                  <TableCell>
                    {isEffectivePublic(a) ? (
                      <Badge variant="public" className="gap-1" title={visibilityTooltip(a)}>
                        <Globe className="size-3" />
                        {t("public")}
                      </Badge>
                    ) : (
                      <Badge variant="private" className="gap-1" title={visibilityTooltip(a)}>
                        <Lock className="size-3" />
                        {t("private")}
                      </Badge>
                    )}
                  </TableCell>
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
                        <DropdownMenuItem onSelect={() => onEdit(a)}>{tc("edit")}</DropdownMenuItem>
                        {isOrgAdmin && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => onDelete(a)}
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
  )
}
