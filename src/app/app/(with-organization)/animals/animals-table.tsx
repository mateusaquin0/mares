"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Archive,
  ChevronDown,
  Download,
  Globe,
  MapPinOff,
  MoreHorizontal,
  Search,
  X,
} from "lucide-react"

import type { AnimalFacets, AnimalListItem, AnimalListQuery, AnimalSortKey } from "@/types/animal"
import { cn } from "@/lib/utils"
import { formatDateOnly } from "@/lib/date"
import { SEX_OPTIONS, LIFE_STAGE_OPTIONS } from "@/lib/animal-enums"
import { downloadAnimalsExport, type ExportFormat } from "@/lib/export-download"
import { publicationStatus } from "@/lib/publication"
import { Badge } from "@/components/ui/badge"
import { Truncate } from "@/components/ui/truncate"
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
  TableEmpty,
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

const PUBLICATION_TOOLTIP = {
  published: "visMapPublished",
  researchPrivate: "visMapResearchPrivate",
  withheld: "visMapWithheld",
} as const

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
  canDelete,
  onEdit,
  onDelete,
  emptyText,
}: {
  items: AnimalListItem[]
  total: number
  query: AnimalListQuery
  patchQuery: (patch: Partial<AnimalListQuery>) => void
  facets: AnimalFacets | undefined
  fetchFilteredIds: () => Promise<string[]>
  loading: boolean
  canDelete: (a: AnimalListItem) => boolean
  onEdit: (a: AnimalListItem) => void
  onDelete: (a: AnimalListItem) => void
  // Mensagem da lista vazia sem filtro (ex.: grupo sem pesquisa).
  emptyText?: string
}) {
  const t = useTranslations("animals")
  const tc = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()

  const controlOf = (a: AnimalListItem) => a.controlId ?? a.simbaRecordNumber ?? ""
  const locationOf = (a: AnimalListItem) => [a.municipality, a.state].filter(Boolean).join(", ")
  const fmtDate = (iso: string | null) => formatDateOnly(iso, locale)
  const sexLabel = (s: string | null) => {
    const o = SEX_OPTIONS.find((x) => x.value === s)
    return o ? t(o.key) : (s ?? "")
  }
  const isEffectivePublic = (a: AnimalListItem) =>
    publicationStatus(a.isPublic, a.research.isPublic) === "published"
  const visibilityTooltip = (a: AnimalListItem) =>
    t(PUBLICATION_TOOLTIP[publicationStatus(a.isPublic, a.research.isPublic)])

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
    query.hidden !== "listed" ||
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
      hidden: "listed",
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
    query.hidden,
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
    <label className="grid gap-0.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {control}
    </label>
  )

  return (
    <div className="flex min-h-0 flex-1 border-t border-border">
      <aside className="-ml-1 flex w-[236px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-border py-3 pl-1 pr-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-serif text-[17px] font-semibold">{t("filtersTitle")}</h2>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-[13px] text-primary underline underline-offset-2 hover:text-foreground"
            >
              <X className="size-3.5" />
              {t("clearFilters")}
            </button>
          )}
        </div>
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
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allVisibility")}</SelectItem>
              <SelectItem value="public">{t("published")}</SelectItem>
              <SelectItem value="private">{t("unpublished")}</SelectItem>
            </SelectContent>
          </Select>,
        )}
        {filterField(
          t("filterSamples"),
          <Select
            value={query.samples}
            onValueChange={(v) => patchQuery({ samples: v as AnimalListQuery["samples"] })}
          >
            <SelectTrigger className="w-full">
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
          t("filterArchived"),
          <Select
            value={query.hidden}
            onValueChange={(v) => patchQuery({ hidden: v as AnimalListQuery["hidden"] })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="listed">{t("archivedExclude")}</SelectItem>
              <SelectItem value="only">{t("archivedOnly")}</SelectItem>
            </SelectContent>
          </Select>,
        )}
        {filterField(
          t("filterFrom"),
          <Input
            type="date"
            value={query.from}
            onChange={(e) => patchQuery({ from: e.target.value })}
            className="w-full"
          />,
        )}
        {filterField(
          t("filterTo"),
          <Input
            type="date"
            value={query.to}
            onChange={(e) => patchQuery({ to: e.target.value })}
            className="w-full"
          />,
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col pl-4">
        <div className="flex min-h-12 flex-wrap items-center gap-3 py-2">
          <div className="relative w-[320px] min-w-0">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={tc("search")}
              className="pl-8"
            />
          </div>
          <span className="text-muted-foreground">{t("count", { count: total })}</span>
          <span className="flex-1" />
          {/* Indivíduo arquivado não é exportado (o servidor aplica a mesma regra). */}
          {query.hidden === "only" ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Archive className="size-4" />
              {t("archivedNotExported")}
            </span>
          ) : (
            selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {t("selectedCount", { count: selected.size })}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" loading={exporting}>
                      <Download className="size-4" />
                      {t("export")}
                      <ChevronDown className="size-4 text-muted-foreground" />
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
            )
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col [&>div]:min-h-0 [&>div]:flex-1 [&>div]:overflow-x-hidden">
          <Table
            className={cn(
              "table-fixed [&_td]:truncate",
              loading && "opacity-60 transition-opacity",
            )}
          >
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label={t("selectAll")}
                    disabled={selectingAll || total === 0 || query.hidden === "only"}
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(v) => toggleAll(v === true)}
                  />
                </TableHead>
                <SortableHead
                  sortKey="control"
                  sort={{ key: query.sort, dir: query.dir }}
                  onToggle={toggleSort}
                  className="w-[124px]"
                >
                  {t("colControl")}
                </SortableHead>
                <SortableHead
                  sortKey="species"
                  sort={{ key: query.sort, dir: query.dir }}
                  onToggle={toggleSort}
                  className="w-[20%]"
                >
                  {t("colSpecies")}
                </SortableHead>
                <SortableHead
                  sortKey="sex"
                  sort={{ key: query.sort, dir: query.dir }}
                  onToggle={toggleSort}
                  className="w-[96px]"
                >
                  {t("colSex")}
                </SortableHead>
                <SortableHead
                  sortKey="location"
                  sort={{ key: query.sort, dir: query.dir }}
                  onToggle={toggleSort}
                  className="w-[18%]"
                >
                  {t("colLocation")}
                </SortableHead>
                <SortableHead
                  sortKey="date"
                  sort={{ key: query.sort, dir: query.dir }}
                  onToggle={toggleSort}
                  className="w-[132px]"
                >
                  {t("colDate")}
                </SortableHead>
                <SortableHead
                  sortKey="isPublic"
                  sort={{ key: query.sort, dir: query.dir }}
                  onToggle={toggleSort}
                  className="w-[148px]"
                >
                  {t("colVisibility")}
                </SortableHead>
                <SortableHead
                  sortKey="samples"
                  sort={{ key: query.sort, dir: query.dir }}
                  onToggle={toggleSort}
                  align="right"
                  className="w-[104px]"
                >
                  {t("colSamples")}
                </SortableHead>
                <TableHead className="w-14 px-2 text-right">
                  <ReloadButton />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableEmpty colSpan={9}>
                  {hasFilters ? tc("noResults") : (emptyText ?? t("empty"))}
                </TableEmpty>
              ) : (
                items.map((a) => (
                  <TableRow
                    key={a.id}
                    data-state={selected.has(a.id) ? "selected" : undefined}
                    onClick={() => router.push(`/app/animals/${a.id}`)}
                    title={t("openAnimal")}
                    className="cursor-pointer"
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={t("selectRow")}
                        checked={selected.has(a.id)}
                        disabled={query.hidden === "only"}
                        onCheckedChange={(v) => toggleRow(a.id, v === true)}
                      />
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">
                      <Truncate className="max-w-full">
                        {controlOf(a) || (
                          <span className="text-muted-foreground">{t("notInformed")}</span>
                        )}
                      </Truncate>
                    </TableCell>
                    <TableCell>
                      <Truncate className="max-w-full">
                        {a.species ? (
                          <span className="font-serif text-base italic">{a.species}</span>
                        ) : (
                          <span className="text-muted-foreground">{t("speciesUndetermined")}</span>
                        )}
                      </Truncate>
                    </TableCell>
                    <TableCell>
                      <Truncate className="max-w-full">{sexLabel(a.sex)}</Truncate>
                    </TableCell>
                    <TableCell>
                      <Truncate className="max-w-full">{locationOf(a) || "—"}</Truncate>
                    </TableCell>
                    <TableCell>{fmtDate(a.eventDate)}</TableCell>
                    <TableCell>
                      {isEffectivePublic(a) ? (
                        <Badge
                          variant="public"
                          className="max-w-full gap-1"
                          title={visibilityTooltip(a)}
                        >
                          <Globe className="size-3 shrink-0" />
                          <span className="truncate">{t("published")}</span>
                        </Badge>
                      ) : (
                        <Badge
                          variant="private"
                          className="max-w-full gap-1"
                          title={visibilityTooltip(a)}
                        >
                          <MapPinOff className="size-3 shrink-0" />
                          <span className="truncate">{t("unpublished")}</span>
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a._count.samples}</TableCell>
                    <TableCell className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground"
                          >
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">{tc("actions")}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => onEdit(a)}>
                            {tc("edit")}
                          </DropdownMenuItem>
                          {canDelete(a) && (
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
      </section>
    </div>
  )
}
