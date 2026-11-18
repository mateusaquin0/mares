"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { ChevronDown, Download, Search, X } from "lucide-react"

import { animalHref } from "@/lib/animal-origin"
import { pathogenName, txt } from "@/lib/catalog-i18n"
import { formatDateOnly } from "@/lib/date"
import { SEX_OPTIONS, LIFE_STAGE_OPTIONS } from "@/lib/animal-enums"
import { useResearchList, useResearchResults } from "@/hooks/use-research"
import { useDragScroll } from "@/hooks/use-drag-scroll"
import type { ProtocolEntry, ResultValue, ResultsAnimal } from "@/types/analysis"
import { ResultMark } from "@/components/analysis-cells"
import { Truncate } from "@/components/ui/truncate"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { MultiSelect } from "@/components/ui/multi-select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableSkeleton } from "@/components/ui/skeleton"
import { TablePagination } from "@/components/ui/table-pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Um "exame" da grade = uma combinação (patógeno, tipo de exame) do protocolo. Cada exame vira
// um conjunto de colunas (os órgãos onde ele é aplicado) na visão geral por animal.
type Test = {
  key: string
  pathogenId: string
  examTypeId: string
  pathogen: ProtocolEntry["pathogen"]
  examType: ProtocolEntry["examType"]
  organIds: Set<string>
}

const testKey = (pathogenId: string, examTypeId: string) => `${pathogenId}|${examTypeId}`
const cellKey = (sampleId: string, pathogenId: string, examTypeId: string) =>
  `${sampleId}|${pathogenId}|${examTypeId}`

const RESULT_PRIORITY: Record<ResultValue, number> = { POSITIVO: 3, INCONCLUSIVO: 2, NEGATIVO: 1 }

// Valor do filtro para "amostra existente, mas ainda sem resultado" (o anel vazio da grade).
const UNTESTED = "UNTESTED"

export function ResultsManager() {
  const t = useTranslations("results")
  const ta = useTranslations("analyses")
  const tan = useTranslations("animals")
  const locale = useLocale()

  const listQ = useResearchList()
  const researches = listQ.data ?? []
  const firstResearchId = researches[0]?.id
  const [researchId, setResearchId] = useState("")
  // Seleciona a primeira pesquisa assim que a lista chega.
  useEffect(() => {
    if (!researchId && firstResearchId) setResearchId(firstResearchId)
  }, [firstResearchId, researchId])

  const resultsQ = useResearchResults(researchId, !!researchId)
  const data = resultsQ.data ?? null

  const [testKeySel, setTestKeySel] = useState("")
  const [query, setQuery] = useState("")
  const [resultSel, setResultSel] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [showInactive, setShowInactive] = useState(false)

  // Colunas opcionais (sexo/fase, local, data) visíveis por padrão; o multiselect permite ocultá-las.
  const OPTIONAL_COLUMNS = ["sexStage", "location", "date"] as const
  const [visibleColumns, setVisibleColumns] = useState<string[]>([...OPTIONAL_COLUMNS])
  const showSexStage = visibleColumns.includes("sexStage")
  const showLocation = visibleColumns.includes("location")
  const showDate = visibleColumns.includes("date")
  const columnOptions = [
    { value: "sexStage", label: t("colSexStage") },
    { value: "location", label: t("colLocation") },
    { value: "date", label: t("colDate") },
  ]

  const resultOptions = [
    {
      value: "POSITIVO",
      label: ta("resultPositive"),
      icon: <ResultMark result="POSITIVO" iconOnly />,
    },
    {
      value: "NEGATIVO",
      label: ta("resultNegative"),
      icon: <ResultMark result="NEGATIVO" iconOnly />,
    },
    {
      value: "INCONCLUSIVO",
      label: ta("resultInconclusive"),
      icon: <ResultMark result="INCONCLUSIVO" iconOnly />,
    },
    { value: UNTESTED, label: ta("resultUntested"), icon: <ResultMark result={null} iconOnly /> },
  ]

  const hasInactive = (data?.protocol ?? []).some((p) => p.status === "INACTIVE")

  // Exames disponíveis (patógeno × tipo de exame), na ordem do protocolo. Combinações inativas
  // ficam ocultas por padrão; o toggle "Mostrar inativos" as inclui (para consultar histórico).
  const tests = useMemo<Test[]>(() => {
    if (!data) return []
    const map = new Map<string, Test>()
    for (const p of data.protocol) {
      if (p.status === "INACTIVE" && !showInactive) continue
      const k = testKey(p.pathogenId, p.examTypeId)
      let test = map.get(k)
      if (!test) {
        test = {
          key: k,
          pathogenId: p.pathogenId,
          examTypeId: p.examTypeId,
          pathogen: p.pathogen,
          examType: p.examType,
          organIds: new Set(),
        }
        map.set(k, test)
      }
      test.organIds.add(p.organId)
    }
    return [...map.values()]
  }, [data, showInactive])

  // Ao trocar de pesquisa/dados, volta para o primeiro exame e limpa os filtros.
  useEffect(() => {
    setTestKeySel(tests[0]?.key ?? "")
    setQuery("")
    setResultSel([])
  }, [tests])

  const test = tests.find((x) => x.key === testKeySel) ?? tests[0] ?? null

  // Índice das análises: (amostra, patógeno, exame) → resultado.
  const resultByCell = useMemo(() => {
    const map = new Map<string, ResultValue | null>()
    for (const a of data?.analyses ?? []) {
      map.set(cellKey(a.sampleId, a.pathogenId, a.examTypeId), a.result)
    }
    return map
  }, [data])

  // Órgãos (colunas) do exame selecionado, ordenados pelo rótulo.
  const organs = useMemo(() => {
    if (!data || !test) return []
    return [
      ...new Map(
        data.animals
          .flatMap((a) => a.samples)
          .filter((s) => test.organIds.has(s.organ.id))
          .map((s) => [s.organ.id, txt(locale, s.organ.name)]),
      ).entries(),
    ]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, locale))
  }, [data, test, locale])

  // Órgãos visíveis: multiselect que oculta colunas de órgão. Ao trocar de exame/pesquisa (o
  // conjunto de órgãos muda), volta a exibir todos. Mantém sempre ao menos um ativo.
  const [visibleOrganIds, setVisibleOrganIds] = useState<string[]>([])
  useEffect(() => {
    setVisibleOrganIds(organs.map((o) => o.id))
  }, [organs])
  const visibleOrgans = organs.filter((o) => visibleOrganIds.includes(o.id))
  const organOptions = organs.map((o) => ({ value: o.id, label: o.label }))

  const sexLabel = (s: string | null) => {
    const o = SEX_OPTIONS.find((x) => x.value === s)
    return o ? tan(o.key) : (s ?? "")
  }
  const stageLabel = (s: string | null) => {
    const o = LIFE_STAGE_OPTIONS.find((x) => x.value === s)
    return o ? tan(o.key) : (s ?? "")
  }
  const resultLabel = (r: ResultValue | null) =>
    r === "POSITIVO"
      ? ta("resultPositive")
      : r === "NEGATIVO"
        ? ta("resultNegative")
        : r === "INCONCLUSIVO"
          ? ta("resultInconclusive")
          : ta("resultUntested")

  const locationOf = (a: ResultsAnimal) => [a.municipality, a.state].filter(Boolean).join(" / ")
  const idOf = (a: ResultsAnimal) => a.controlId || a.simbaRecordNumber || "—"

  // Resultado agregado de um animal num órgão para o exame atual. `hasSample` distingue
  // "sem amostra deste órgão" (—) de "amostra sem resultado" (anel vazio).
  const cellOf = useCallback(
    (animal: ResultsAnimal, organId: string) => {
      if (!test) return { hasSample: false, result: null as ResultValue | null }
      const samples = animal.samples.filter((s) => s.organ.id === organId)
      if (samples.length === 0) return { hasSample: false, result: null as ResultValue | null }
      let best: ResultValue | null = null
      for (const s of samples) {
        const r = resultByCell.get(cellKey(s.id, test.pathogenId, test.examTypeId)) ?? null
        if (r && (!best || RESULT_PRIORITY[r] > RESULT_PRIORITY[best])) best = r
      }
      return { hasSample: true, result: best }
    },
    [test, resultByCell],
  )

  const search = query.trim().toLowerCase()
  const animals = useMemo(() => {
    let list = data?.animals ?? []
    if (search) {
      list = list.filter((a) =>
        [a.controlId, a.simbaRecordNumber, a.species, a.municipality, a.state, a.strandingBeach]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search),
      )
    }
    // Filtro por resultado: mantém o animal que tenha ao menos um material biológico visível
    // com um dos resultados marcados, no exame selecionado.
    if (resultSel.length > 0) {
      list = list.filter((a) =>
        visibleOrganIds.some((organId) => {
          const { hasSample, result } = cellOf(a, organId)
          if (!hasSample) return false
          return resultSel.includes(result ?? UNTESTED)
        }),
      )
    }
    return list
  }, [data, search, resultSel, visibleOrganIds, cellOf])

  // Paginação client-side sobre a lista filtrada. Volta à primeira página quando o conjunto
  // muda (busca, filtro de resultado, troca de exame ou de pesquisa).
  useEffect(() => {
    setPage(1)
  }, [search, resultSel, testKeySel, data])
  const pageCount = Math.max(1, Math.ceil(animals.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pagedAnimals = animals.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const testOption = (x: Test) =>
    `${txt(locale, x.examType.name)} — ${pathogenName(locale, x.pathogen)}`

  // Arrastar-para-rolar: mira o wrapper `overflow-auto` que o componente Table cria em volta
  // da <table>, permitindo puxar a grade horizontalmente com o mouse.
  const attachDrag = useDragScroll<HTMLTableElement>((table) => table.parentElement)

  // Exportação: sempre exporta todos os resultados da pesquisa, respeitando o filtro de busca.
  const exportHref = (fmt: "darwin-core" | "xlsx") =>
    `/api/research/${researchId}/export/${fmt}${search ? `?q=${encodeURIComponent(search)}` : ""}`
  const canExport = !!researchId && (data?.animals.length ?? 0) > 0

  return (
    <div className="flex h-full min-h-[42rem] flex-col gap-4 px-page pb-8 pt-3.5">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[1_1_420px]">
          <h1 className="font-serif text-[28px] font-medium leading-8">{t("title")}</h1>
          <p className="mt-0.5 max-w-[820px] text-pretty text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canExport && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="size-4" />
                {t("export")}
                <ChevronDown className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={exportHref("darwin-core")}>{t("exportDarwinCore")}</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={exportHref("xlsx")}>{t("exportXlsx")}</a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="grid grid-cols-4 items-end gap-x-3 gap-y-2.5">
        <div className="col-span-2 grid min-w-0 gap-px">
          <label className="text-xs font-semibold leading-[14px] text-muted-foreground">
            {t("research")}
          </label>
          <Select value={researchId} onValueChange={setResearchId}>
            <SelectTrigger>
              <SelectValue placeholder={t("selectResearch")} />
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

        {tests.length > 0 && (
          <div className="col-span-2 grid min-w-0 gap-px">
            <label className="text-xs font-semibold leading-[14px] text-muted-foreground">
              {t("test")}
            </label>
            {tests.length > 1 ? (
              <Select value={test?.key ?? ""} onValueChange={setTestKeySel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tests.map((x) => (
                    <SelectItem key={x.key} value={x.key}>
                      {testOption(x)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="flex h-[30px] items-center font-semibold">
                {test ? testOption(test) : ""}
              </p>
            )}
          </div>
        )}
      </div>

      {resultsQ.isLoading ? (
        <TableSkeleton rows={6} />
      ) : !data || data.protocol.length === 0 ? (
        <p className="text-muted-foreground">{t("noProtocol")}</p>
      ) : data.animals.length === 0 ? (
        <p className="text-muted-foreground">{t("noAnimals")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-72 min-w-0">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="pl-8"
                />
              </div>
              <MultiSelect
                options={resultOptions}
                value={resultSel}
                onChange={setResultSel}
                placeholder={t("result")}
                emptyText={t("columnsEmpty")}
                summary={(n) => `${t("result")} · ${t("selectedCount", { count: n })}`}
                searchable={false}
                triggerClassName="w-auto min-w-48"
              />
              <MultiSelect
                options={columnOptions}
                value={visibleColumns}
                onChange={setVisibleColumns}
                placeholder={t("columns")}
                emptyText={t("columnsEmpty")}
                summary={(n) => `${t("columns")} · ${t("selectedCount", { count: n })}`}
                searchable={false}
                triggerClassName="w-auto min-w-48"
              />
              {organOptions.length > 0 && (
                <MultiSelect
                  options={organOptions}
                  value={visibleOrganIds}
                  onChange={(v) => {
                    // Mantém ao menos um órgão visível: ignora a tentativa de ocultar o último.
                    if (v.length > 0) setVisibleOrganIds(v)
                  }}
                  placeholder={t("organs")}
                  searchPlaceholder={t("searchOrgan")}
                  emptyText={t("columnsEmpty")}
                  summary={(n) => `${t("organs")} · ${t("selectedCount", { count: n })}`}
                  triggerClassName="w-auto min-w-48"
                />
              )}
              {hasInactive && (
                <label className="flex items-center gap-1.5">
                  <Checkbox
                    checked={showInactive}
                    onCheckedChange={(v) => setShowInactive(v === true)}
                  />
                  {t("showInactive")}
                </label>
              )}
              {(query || resultSel.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("")
                    setResultSel([])
                  }}
                  className="inline-flex items-center gap-1 text-[13px] text-primary underline underline-offset-2 hover:text-foreground"
                >
                  <X className="size-3.5" />
                  {tan("clearFilters")}
                </button>
              )}
            </div>

            <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
              <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1 text-[13px]">
                <ResultMark result="POSITIVO" />
                <ResultMark result="NEGATIVO" />
                <ResultMark result="INCONCLUSIVO" />
                <ResultMark result={null} />
                <span aria-hidden className="h-4 w-px bg-border" />
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <b className="font-normal text-foreground">—</b>
                  {t("emptyCellLegend")}
                </span>
              </div>
              <b className="font-semibold">{t("animalCount", { count: animals.length })}</b>
            </div>
          </div>

          {animals.length === 0 ? (
            <p className="text-muted-foreground">{t("noMatch")}</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden border-t-2 border-foreground [&>div]:h-full">
              <Table ref={attachDrag} density="compact">
                <TableHeader className="sticky top-0 z-10 border-t-0 bg-background">
                  <TableRow>
                    <TableHead className="sticky left-0 z-[1] border-r border-border bg-background">
                      {t("colId")}
                    </TableHead>
                    <TableHead>{t("colSpecies")}</TableHead>
                    {showSexStage && <TableHead>{t("colSexStage")}</TableHead>}
                    {showLocation && <TableHead>{t("colLocation")}</TableHead>}
                    {showDate && <TableHead>{t("colDate")}</TableHead>}
                    {visibleOrgans.map((o) => (
                      <TableHead key={o.id}>{o.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedAnimals.map((a) => (
                    <TableRow key={a.id} className="hover:bg-transparent">
                      <TableCell className="sticky left-0 z-[1] border-r border-border bg-background align-top">
                        <Truncate>
                          <Link
                            href={animalHref(a.id, "results")}
                            className="font-semibold tabular-nums underline underline-offset-2 hover:text-primary"
                          >
                            {idOf(a)}
                          </Link>
                        </Truncate>
                        {a.simbaRecordNumber && (
                          <Truncate className="mt-0.5 text-xs text-muted-foreground">
                            SIMBA: {a.simbaRecordNumber}
                          </Truncate>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <Truncate className="font-serif text-base italic">{a.species}</Truncate>
                      </TableCell>
                      {showSexStage && (
                        <TableCell className="align-top text-muted-foreground">
                          <Truncate>
                            {[sexLabel(a.sex), stageLabel(a.lifeStage)]
                              .filter(Boolean)
                              .join(" / ") || "—"}
                          </Truncate>
                        </TableCell>
                      )}
                      {showLocation && (
                        <TableCell className="align-top text-muted-foreground">
                          <Truncate>{locationOf(a) || "—"}</Truncate>
                          {a.strandingBeach && (
                            <Truncate className="mt-0.5 text-xs">{a.strandingBeach}</Truncate>
                          )}
                        </TableCell>
                      )}
                      {showDate && (
                        <TableCell className="whitespace-nowrap align-top text-muted-foreground">
                          {formatDateOnly(a.eventDate, locale) || "—"}
                        </TableCell>
                      )}
                      {visibleOrgans.map((o) => {
                        const { hasSample, result } = cellOf(a, o.id)
                        return (
                          <TableCell key={o.id} className="align-middle">
                            {hasSample ? (
                              <span title={`${o.label}: ${resultLabel(result)}`}>
                                <ResultMark result={result} />
                              </span>
                            ) : (
                              <span
                                title={`${o.label}: ${t("noSampleForOrgan")}`}
                                className="text-muted-foreground"
                              >
                                —
                              </span>
                            )}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {animals.length > 0 && (
            <TablePagination
              page={currentPage}
              pageSize={pageSize}
              total={animals.length}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n)
                setPage(1)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
