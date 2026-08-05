"use client"

import { Fragment, useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { FlaskConical, Search, X } from "lucide-react"

import { pathogenName, txt } from "@/lib/catalog-i18n"
import { isBroadPathogen } from "@/lib/pathogen"
import { useErrorMessage } from "@/lib/use-error-message"
import { useAnimalGrid } from "@/hooks/use-animals"
import { useUpsertAnalysis } from "@/hooks/use-analyses"
import type {
  AnalysisCell,
  AnalysisRow,
  ProtocolEntry,
  ResultValue,
  SampleLite,
} from "@/types/analysis"
import { MeasureInput, NotesInput, ResultSelect } from "@/components/analysis-cells"
import { SampleStatusBadge } from "@/components/sample-status-badge"
import { ConfirmationPanel } from "./confirmation-panel"
import { Truncate } from "@/components/ui/truncate"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { TableSkeleton } from "@/components/ui/skeleton"
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

const ALL = "__all__"
const UNTESTED = "UNTESTED"
const RESULTS: ResultValue[] = ["POSITIVO", "NEGATIVO", "INCONCLUSIVO"]

const keyOf = (sampleId: string, pathogenId: string, examTypeId: string) =>
  `${sampleId}|${pathogenId}|${examTypeId}`

// Célula editável da grade + o id da análise persistida (necessário para pendurar confirmações).
type Cell = AnalysisCell & { id?: string }

export function AnalysesTab({ animalId }: { animalId: string }) {
  const t = useTranslations("analyses")
  const ts = useTranslations("samples")
  const locale = useLocale()
  const em = useErrorMessage()

  const gridQ = useAnimalGrid(animalId)
  const grid = gridQ.data ?? null
  const loading = gridQ.isLoading
  const upsertM = useUpsertAnalysis()
  const [cells, setCells] = useState<Record<string, Cell>>({})

  // ── Filtros da grade ──
  const [query, setQuery] = useState("")
  const [fResult, setFResult] = useState(ALL)
  const [fResearch, setFResearch] = useState(ALL)
  const [fOrgan, setFOrgan] = useState(ALL)
  const [showInactive, setShowInactive] = useState(false)

  // Sincroniza o mapa de células (editável, com update otimista) com a grade carregada.
  // Só os RASTREIOS (parentAnalysisId null) viram células; as confirmações são aninhadas.
  useEffect(() => {
    if (!grid) return
    const map: Record<string, Cell> = {}
    for (const a of grid.analyses) {
      if (a.parentAnalysisId !== null) continue
      map[keyOf(a.sampleId, a.pathogenId, a.examTypeId)] = {
        id: a.id,
        result: a.result,
        measureValue: a.measureValue,
        notes: a.notes,
      }
    }
    setCells(map)
  }, [grid])

  const getCell = (k: string): Cell => cells[k] ?? { result: null, measureValue: null, notes: null }

  // Confirmações (análises-filhas) agrupadas por rastreio-pai, reidratadas da grade.
  const childrenByParent = new Map<string, AnalysisRow[]>()
  for (const a of grid?.analyses ?? []) {
    if (a.parentAnalysisId === null) continue
    const list = childrenByParent.get(a.parentAnalysisId) ?? []
    list.push(a)
    childrenByParent.set(a.parentAnalysisId, list)
  }

  const resultLabel = (r: string) =>
    ({
      POSITIVO: t("resultPositive"),
      NEGATIVO: t("resultNegative"),
      INCONCLUSIVO: t("resultInconclusive"),
    })[r] ?? r

  async function save(sample: SampleLite, entry: ProtocolEntry, patch: Partial<Cell>) {
    const k = keyOf(sample.id, entry.pathogenId, entry.examTypeId)
    const prev = getCell(k)
    const next = { ...prev, ...patch }
    setCells((c) => ({ ...c, [k]: next }))

    try {
      const saved = await upsertM.mutateAsync({
        sampleId: sample.id,
        pathogenId: entry.pathogenId,
        examTypeId: entry.examTypeId,
        result: next.result,
        measureValue: next.measureValue,
        notes: next.notes,
      })
      // Guarda o id da análise persistida (habilita pendurar confirmações neste positivo).
      if (saved?.id) setCells((c) => ({ ...c, [k]: { ...next, id: saved.id } }))
      toast.success(t("saved"))
    } catch (err) {
      toast.error(t("saveError"), { description: em(err) })
      setCells((c) => ({ ...c, [k]: prev })) // reverte
    }
  }

  if (loading) return <TableSkeleton rows={4} />
  if (!grid) return null
  if (grid.sections.length === 0)
    return <p className="text-sm text-muted-foreground">{t("noSamples")}</p>

  // Indivíduo compartilhado: uma seção por pesquisa. Com uma só pesquisa, oculta o cabeçalho.
  const multi = grid.sections.length > 1

  // Protocolos inativos: ocultos por padrão; o toggle os revela em leitura (badge, sem editar).
  const hasInactive = grid.sections.some((s) => s.protocol.some((p) => p.status === "INACTIVE"))

  // ── Opções de filtro derivadas da grade ──
  const researchOptions = grid.sections.map((s) => ({ id: s.research.id, label: s.research.name }))
  const organOptions = [
    ...new Map(
      grid.sections
        .flatMap((s) => s.samples)
        .map((sm) => [sm.organ.id, txt(locale, sm.organ.name)]),
    ).entries(),
  ]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, locale))

  const search = query.trim().toLowerCase()
  const matchEntry = (sample: SampleLite, entry: ProtocolEntry) => {
    const result = getCell(keyOf(sample.id, entry.pathogenId, entry.examTypeId)).result
    if (fResult === UNTESTED && result !== null) return false
    if (fResult !== ALL && fResult !== UNTESTED && result !== fResult) return false
    if (search) {
      const hay = [pathogenName(locale, entry.pathogen), txt(locale, entry.examType.name)]
        .join(" ")
        .toLowerCase()
      if (!hay.includes(search)) return false
    }
    return true
  }

  const hasFilters = query !== "" || fResult !== ALL || fResearch !== ALL || fOrgan !== ALL
  const clearFilters = () => {
    setQuery("")
    setFResult(ALL)
    setFResearch(ALL)
    setFOrgan(ALL)
  }

  // Filtra seções/amostras/linhas. Com filtro ativo, oculta amostras sem linhas correspondentes;
  // sem filtro, preserva o comportamento original (inclusive a nota "não aplicável").
  const sectionsToRender = grid.sections
    .filter((sec) => fResearch === ALL || sec.research.id === fResearch)
    .map((sec) => ({
      sec,
      samples: sec.samples
        .filter((sample) => fOrgan === ALL || sample.organ.id === fOrgan)
        .map((sample) => ({
          sample,
          entries: sec.protocol
            .filter((p) => p.organId === sample.organ.id)
            .filter((entry) => entry.status === "ACTIVE" || showInactive)
            .filter((entry) => matchEntry(sample, entry)),
        }))
        .filter(({ entries }) => !hasFilters || entries.length > 0),
    }))
    .filter(({ samples }) => samples.length > 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
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
        <Select value={fResult} onValueChange={setFResult}>
          <SelectTrigger className="h-9 w-auto min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allResults")}</SelectItem>
            <SelectItem value={UNTESTED}>{t("resultUntested")}</SelectItem>
            {RESULTS.map((r) => (
              <SelectItem key={r} value={r}>
                {resultLabel(r)}
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
              <SelectItem value={ALL}>{ts("allOrgans")}</SelectItem>
              {organOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {multi && (
          <Select value={fResearch} onValueChange={setFResearch}>
            <SelectTrigger className="h-9 w-auto min-w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{ts("allResearch")}</SelectItem>
              {researchOptions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {hasInactive && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={showInactive} onCheckedChange={(v) => setShowInactive(v === true)} />
            {t("showInactive")}
          </label>
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="size-3.5" />
            {ts("clearFilters")}
          </Button>
        )}
      </div>

      {sectionsToRender.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noMatch")}</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-10 overflow-y-auto">
          {sectionsToRender.map(({ sec: section, samples }) => (
            <div key={section.research.id} className="space-y-6">
              {multi && (
                <div className="flex items-center gap-2 border-b pb-1.5">
                  <FlaskConical className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">{section.research.name}</h3>
                </div>
              )}
              <Accordion
                type="multiple"
                key={samples.map(({ sample }) => sample.id).join(",")}
                defaultValue={samples.map(({ sample }) => sample.id)}
                className="space-y-3"
              >
                {samples.map(({ sample, entries }) => (
                  <AccordionItem key={sample.id} value={sample.id}>
                    <AccordionTrigger>
                      <span className="flex flex-1 flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          {txt(locale, sample.organ.name)}
                          <span className="font-normal"> ({sample.sampleType})</span>
                        </span>
                        <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">
                          {t("entryCount", { count: entries.length })}
                        </span>
                        <SampleStatusBadge status={sample.status} className="shrink-0" />
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      {entries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("noApplicable")}</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("colPathogen")}</TableHead>
                              <TableHead>{t("colExam")}</TableHead>
                              <TableHead className="w-44">{t("colResult")}</TableHead>
                              <TableHead className="w-32">{t("colMeasure")}</TableHead>
                              <TableHead>{t("colNotes")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {entries.map((entry) => {
                              const k = keyOf(sample.id, entry.pathogenId, entry.examTypeId)
                              const cell = getCell(k)
                              const inactive = entry.status === "INACTIVE"
                              const confirmations = cell.id
                                ? (childrenByParent.get(cell.id) ?? [])
                                : []
                              const isPositive = cell.result === "POSITIVO"
                              // Painel de confirmação: só em positivo de alvo AMPLO (família/gênero
                              // — onde a espécie ainda não está resolvida), ou onde já há
                              // confirmações (inclusive órfãs, se o rastreio deixou de ser positivo).
                              const showPanel =
                                (isPositive && isBroadPathogen(entry.pathogen) && !!cell.id) ||
                                confirmations.length > 0
                              return (
                                <Fragment key={k}>
                                  <TableRow>
                                    <TableCell className="font-medium">
                                      <span className="flex items-center gap-2">
                                        <Truncate>{pathogenName(locale, entry.pathogen)}</Truncate>
                                        {inactive && (
                                          <Badge variant="secondary">{t("inactive")}</Badge>
                                        )}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                      <Truncate>{txt(locale, entry.examType.name)}</Truncate>
                                    </TableCell>
                                    <TableCell>
                                      <ResultSelect
                                        value={cell.result}
                                        disabled={inactive}
                                        onChange={(result) => save(sample, entry, { result })}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      {entry.examType.measureLabel ? (
                                        <MeasureInput
                                          value={cell.measureValue}
                                          placeholder={txt(locale, entry.examType.measureLabel)}
                                          unit={entry.examType.measureUnit}
                                          disabled={inactive}
                                          onCommit={(n) => {
                                            if (n !== cell.measureValue)
                                              save(sample, entry, { measureValue: n })
                                          }}
                                        />
                                      ) : (
                                        <span className="text-sm text-muted-foreground">—</span>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <NotesInput
                                        value={cell.notes}
                                        placeholder={t("notesPlaceholder")}
                                        disabled={inactive}
                                        onCommit={(s) => {
                                          if (s !== cell.notes) save(sample, entry, { notes: s })
                                        }}
                                      />
                                    </TableCell>
                                  </TableRow>
                                  {showPanel && cell.id && (
                                    <TableRow className="hover:bg-transparent">
                                      <TableCell colSpan={5} className="pb-4 pt-0">
                                        <ConfirmationPanel
                                          animalId={animalId}
                                          parentId={cell.id}
                                          screeningPathogen={entry.pathogen}
                                          confirmations={confirmations}
                                          parentIsPositive={isPositive}
                                        />
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </Fragment>
                              )
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
