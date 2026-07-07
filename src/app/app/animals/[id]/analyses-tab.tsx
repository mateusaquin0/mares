"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { FlaskConical } from "lucide-react"

import { pathogenName, txt } from "@/lib/catalog-i18n"
import { useErrorMessage } from "@/lib/use-error-message"
import { useAnimalGrid } from "@/hooks/use-animals"
import { useUpsertAnalysis } from "@/hooks/use-analyses"
import type {
  AnalysisCell as Cell,
  ProtocolEntry,
  ResultValue,
  SampleLite,
} from "@/types/analysis"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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

const UNTESTED = "UNTESTED"

const keyOf = (sampleId: string, pathogenId: string, examTypeId: string) =>
  `${sampleId}|${pathogenId}|${examTypeId}`

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

  // Sincroniza o mapa de células (editável, com update otimista) com a grade carregada.
  useEffect(() => {
    if (!grid) return
    const map: Record<string, Cell> = {}
    for (const a of grid.analyses) {
      map[keyOf(a.sampleId, a.pathogenId, a.examTypeId)] = {
        result: a.result,
        measureValue: a.measureValue,
        notes: a.notes,
      }
    }
    setCells(map)
  }, [grid])

  const getCell = (k: string): Cell => cells[k] ?? { result: null, measureValue: null, notes: null }

  const statusLabel = (s: string) =>
    ({
      STORED: ts("statusStored"),
      IN_USE: ts("statusInUse"),
      DEPLETED: ts("statusDepleted"),
      DEGRADED: ts("statusDegraded"),
    })[s] ?? s

  async function save(sample: SampleLite, entry: ProtocolEntry, patch: Partial<Cell>) {
    const k = keyOf(sample.id, entry.pathogenId, entry.examTypeId)
    const prev = getCell(k)
    const next = { ...prev, ...patch }
    setCells((c) => ({ ...c, [k]: next }))

    try {
      await upsertM.mutateAsync({
        sampleId: sample.id,
        pathogenId: entry.pathogenId,
        examTypeId: entry.examTypeId,
        result: next.result,
        measureValue: next.measureValue,
        notes: next.notes,
      })
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

  return (
    <div className="space-y-10">
      {grid.sections.map((section) => (
        <div key={section.research.id} className="space-y-6">
          {multi && (
            <div className="flex items-center gap-2 border-b pb-1.5">
              <FlaskConical className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{section.research.name}</h3>
            </div>
          )}
          <div className="space-y-8">
            {section.samples.map((sample) => {
              const entries = section.protocol.filter((p) => p.organId === sample.organ.id)
              return (
          <div key={sample.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">
                {sample.sampleType} — {txt(locale, sample.organ.name)}
              </h3>
              <Badge variant="secondary">{statusLabel(sample.status)}</Badge>
            </div>

            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noApplicable")}</p>
            ) : (
              <div className="rounded-md border">
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
                      return (
                        <TableRow key={k}>
                          <TableCell className="font-medium">
                            {pathogenName(locale, entry.pathogen)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {txt(locale, entry.examType.name)}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={cell.result ?? UNTESTED}
                              onValueChange={(v) =>
                                save(sample, entry, {
                                  result: v === UNTESTED ? null : (v as ResultValue),
                                })
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={UNTESTED}>{t("resultUntested")}</SelectItem>
                                <SelectItem value="POSITIVO">
                                  <span className="flex items-center gap-2">
                                    <span className="size-2 rounded-full bg-[hsl(123_41%_45%)]" />
                                    {t("resultPositive")}
                                  </span>
                                </SelectItem>
                                <SelectItem value="NEGATIVO">
                                  <span className="flex items-center gap-2">
                                    <span className="size-2 rounded-full bg-muted-foreground/40" />
                                    {t("resultNegative")}
                                  </span>
                                </SelectItem>
                                <SelectItem value="INCONCLUSIVO">
                                  <span className="flex items-center gap-2">
                                    <span className="size-2 rounded-full bg-[hsl(35_80%_50%)]" />
                                    {t("resultInconclusive")}
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {entry.examType.measureLabel ? (
                              <MeasureInput
                                value={cell.measureValue}
                                placeholder={txt(locale, entry.examType.measureLabel)}
                                unit={entry.examType.measureUnit}
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
                              onCommit={(s) => {
                                if (s !== cell.notes) save(sample, entry, { notes: s })
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )
      })}
          </div>
        </div>
      ))}
    </div>
  )
}

// Inputs não controlados que só disparam save no blur (evita PUT a cada tecla).
// O rótulo da medida (Ct, Título, OD...) vem do próprio exame como placeholder; a unidade
// opcional é exibida como sufixo.
function MeasureInput({
  value,
  placeholder,
  unit,
  onCommit,
}: {
  value: number | null
  placeholder: string
  unit: string | null
  onCommit: (n: number | null) => void
}) {
  const input = (
    <Input
      key={value ?? ""}
      defaultValue={value ?? ""}
      type="number"
      step="any"
      placeholder={placeholder}
      title={placeholder}
      className="h-8"
      onBlur={(e) => {
        const raw = e.target.value.trim()
        onCommit(raw === "" ? null : Number(raw))
      }}
    />
  )
  if (!unit) return input
  return (
    <div className="flex items-center gap-1.5">
      {input}
      <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>
    </div>
  )
}

function NotesInput({
  value,
  placeholder,
  onCommit,
}: {
  value: string | null
  placeholder: string
  onCommit: (s: string | null) => void
}) {
  return (
    <Input
      key={value ?? ""}
      defaultValue={value ?? ""}
      placeholder={placeholder}
      className="h-8"
      onBlur={(e) => {
        const raw = e.target.value.trim()
        onCommit(raw === "" ? null : raw)
      }}
    />
  )
}
