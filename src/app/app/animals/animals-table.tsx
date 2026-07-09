"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { Download, Globe, Lock, MoreHorizontal, X } from "lucide-react"

import type { AnimalFacets, AnimalListItem, AnimalListQuery, AnimalSortKey } from "@/types/animal"
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
import { TablePagination } from "@/components/ui/table-pagination"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Tabela de animais com filtros, ordenação e paginação SERVER-SIDE. O estado da consulta
// (`query`) vive no AnimalsManager, que busca a página e as facetas; aqui só apresentamos e
// sinalizamos mudanças via `patchQuery`. Ver docs/CONTRATO_API.md §1.
export function AnimalsTable({
  items,
  total,
  query,
  patchQuery,
  facets,
  fetchFilteredIds,
  loading,
  isOrgAdmin,
  onEdit,
  onDelete,
}: {
  items: AnimalListItem[]
  total: number
  query: AnimalListQuery
  patchQuery: (patch: Partial<AnimalListQuery>) => void
  facets: AnimalFacets | undefined
  fetchFilteredIds: () => Promise<string[]>
  loading: boolean
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
  const isEffectivePublic = (a: AnimalListItem) => a.isPublic && a.research.isPublic
  const visibilityTooltip = (a: AnimalListItem) => {
    if (!a.research.isPublic) return t("visMapResearchPrivate")
    return a.isPublic ? t("visMapPublic") : t("visMapAnimalHidden")
  }

  // ── Opções dos filtros: vêm das facetas (todo o escopo), não da página. ──
  const speciesOptions = useMemo<MultiSelectOption[]>(
    () => (facets?.species ?? []).map((s) => ({ value: s, label: s })),
    [facets],
  )
  const stateOptions = useMemo<MultiSelectOption[]>(
    () => (facets?.states ?? []).map((s) => ({ value: s, label: s })),
    [facets],
  )
  const researchOptions = useMemo<MultiSelectOption[]>(
    () => (facets?.researches ?? []).map((r) => ({ value: r.id, label: r.name })),
    [facets],
  )
  const pathogenOptions = useMemo<MultiSelectOption[]>(
    () => (facets?.pathogens ?? []).map((p) => ({ value: p.id, label: p.label })),
    [facets],
  )
  const sexOptions = useMemo<MultiSelectOption[]>(
    () => SEX_OPTIONS.map((o) => ({ value: o.value, label: t(o.key) })),
    [t],
  )
  const lifeStageOptions = useMemo<MultiSelectOption[]>(
    () => LIFE_STAGE_OPTIONS.map((o) => ({ value: o.value, label: t(o.key) })),
    [t],
  )

  const hasFilters =
    !!query.q ||
    query.species.length > 0 ||
    query.sex.length > 0 ||
    query.lifeStage.length > 0 ||
    query.state.length > 0 ||
    query.research.length > 0 ||
    query.pathogen.length > 0 ||
    query.visibility !== "all" ||
    query.samples !== "all" ||
    query.from !== "" ||
    query.to !== ""

  // Busca textual com debounce (evita um request por tecla).
  const [searchInput, setSearchInput] = useState(query.q)
  useEffect(() => setSearchInput(query.q), [query.q])
  useEffect(() => {
    const id = setTimeout(() => {
      if (searchInput.trim() !== query.q) patchQuery({ q: searchInput.trim() })
    }, 350)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const clearFilters = () => {
    setSearchInput("")
    patchQuery({
      q: "",
      species: [],
      sex: [],
      lifeStage: [],
      state: [],
      research: [],
      pathogen: [],
      visibility: "all",
      samples: "all",
      from: "",
      to: "",
    })
  }

  const toggleSort = (key: string) =>
    patchQuery({
      sort: key as AnimalSortKey,
      dir: query.sort === key && query.dir === "asc" ? "desc" : "asc",
    })

  // ── Seleção para exportação. "Selecionar todos" cobre TODO o conjunto filtrado (todas as
  //    páginas), buscando os ids no servidor. A seleção é limpa ao mudar os filtros. ──
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectingAll, setSelectingAll] = useState(false)
  const [exporting, setExporting] = useState(false)

  const filterSig = JSON.stringify([
    query.q,
    query.species,
    query.sex,
    query.lifeStage,
    query.state,
    query.research,
    query.pathogen,
    query.visibility,
    query.samples,
    query.from,
    query.to,
  ])
  useEffect(() => setSelected(new Set()), [filterSig])

  const allSelected = total > 0 && selected.size >= total
  const someSelected = selected.size > 0 && !allSelected

  const toggleRow = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  async function toggleAll(on: boolean) {
    if (!on) {
      setSelected(new Set())
      return
    }
    setSelectingAll(true)
    try {
      const ids = await fetchFilteredIds()
      setSelected(new Set(ids))
    } catch {
      toast.error(t("exportError"))
    } finally {
      setSelectingAll(false)
    }
  }

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
              value={query.species}
              onChange={(v) => patchQuery({ species: v })}
              placeholder={t("allSpecies")}
              searchPlaceholder={t("filterSpecies")}
              emptyText={tc("noResults")}
            />
          </div>,
        )}
        {filterField(
          t("colSex"),
          <div className="w-full">
            <MultiSelect
              options={sexOptions}
              value={query.sex}
              onChange={(v) => patchQuery({ sex: v })}
              placeholder={t("allSexes")}
              emptyText={tc("noResults")}
              searchable={false}
            />
          </div>,
        )}
        {filterField(
          t("colLifeStage"),
          <div className="w-full">
            <MultiSelect
              options={lifeStageOptions}
              value={query.lifeStage}
              onChange={(v) => patchQuery({ lifeStage: v })}
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
                value={query.state}
                onChange={(v) => patchQuery({ state: v })}
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
                value={query.research}
                onChange={(v) => patchQuery({ research: v })}
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
                value={query.pathogen}
                onChange={(v) => patchQuery({ pathogen: v })}
                placeholder={t("allPathogens")}
                searchPlaceholder={t("filterPathogen")}
                emptyText={tc("noResults")}
              />
            </div>,
          )}
        {filterField(
          t("colVisibility"),
          <Select
            value={query.visibility}
            onValueChange={(v) => patchQuery({ visibility: v as AnimalListQuery["visibility"] })}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allVisibility")}</SelectItem>
              <SelectItem value="public">{t("public")}</SelectItem>
              <SelectItem value="private">{t("private")}</SelectItem>
            </SelectContent>
          </Select>,
        )}
        {filterField(
          t("filterSamples"),
          <Select
            value={query.samples}
            onValueChange={(v) => patchQuery({ samples: v as AnimalListQuery["samples"] })}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allSamples")}</SelectItem>
              <SelectItem value="with">{t("withSamples")}</SelectItem>
              <SelectItem value="without">{t("withoutSamples")}</SelectItem>
            </SelectContent>
          </Select>,
        )}
        {filterField(
          t("filterFrom"),
          <Input
            type="date"
            value={query.from}
            onChange={(e) => patchQuery({ from: e.target.value })}
            className="h-9 w-full"
          />,
        )}
        {filterField(
          t("filterTo"),
          <Input
            type="date"
            value={query.to}
            onChange={(e) => patchQuery({ to: e.target.value })}
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
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
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
        <Table className={loading ? "opacity-60 transition-opacity" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label={t("selectAll")}
                  disabled={selectingAll || total === 0}
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAll(v === true)}
                />
              </TableHead>
              <SortableHead
                sortKey="control"
                sort={{ key: query.sort, dir: query.dir }}
                onToggle={toggleSort}
              >
                {t("colControl")}
              </SortableHead>
              <SortableHead
                sortKey="species"
                sort={{ key: query.sort, dir: query.dir }}
                onToggle={toggleSort}
              >
                {t("colSpecies")}
              </SortableHead>
              <SortableHead
                sortKey="sex"
                sort={{ key: query.sort, dir: query.dir }}
                onToggle={toggleSort}
              >
                {t("colSex")}
              </SortableHead>
              <SortableHead
                sortKey="location"
                sort={{ key: query.sort, dir: query.dir }}
                onToggle={toggleSort}
              >
                {t("colLocation")}
              </SortableHead>
              <SortableHead
                sortKey="date"
                sort={{ key: query.sort, dir: query.dir }}
                onToggle={toggleSort}
              >
                {t("colDate")}
              </SortableHead>
              <SortableHead
                sortKey="isPublic"
                sort={{ key: query.sort, dir: query.dir }}
                onToggle={toggleSort}
              >
                {t("colVisibility")}
              </SortableHead>
              <SortableHead
                sortKey="samples"
                sort={{ key: query.sort, dir: query.dir }}
                onToggle={toggleSort}
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
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                  {hasFilters ? tc("noResults") : t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              items.map((a) => (
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

      <TablePagination
        page={query.page}
        pageSize={query.pageSize}
        total={total}
        onPageChange={(p) => patchQuery({ page: p })}
        onPageSizeChange={(ps) => patchQuery({ pageSize: ps })}
      />
    </div>
  )
}
