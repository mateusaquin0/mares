"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { pathogenName, txt, type I18nText } from "@/lib/catalog-i18n"
import { useErrorMessage } from "@/lib/use-error-message"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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

type ResultValue = "POSITIVO" | "NEGATIVO" | "INCONCLUSIVO"
const UNTESTED = "UNTESTED"

type ProtocolEntry = {
  organId: string
  pathogenId: string
  examTypeId: string
  pathogen: { id: string; scientificName: string | null; name: string | I18nText | null }
  examType: { id: string; name: string | I18nText }
}
type SampleLite = {
  id: string
  sampleType: string
  status: string
  organ: { id: string; name: string | I18nText }
}
type Cell = { result: ResultValue | null; ctValue: number | null; notes: string | null }
type Grid = {
  protocol: ProtocolEntry[]
  samples: SampleLite[]
  analyses: (Cell & { sampleId: string; pathogenId: string; examTypeId: string })[]
}

const keyOf = (sampleId: string, pathogenId: string, examTypeId: string) =>
  `${sampleId}|${pathogenId}|${examTypeId}`

export function AnalysesTab({ animalId, reloadKey }: { animalId: string; reloadKey: number }) {
  const t = useTranslations("analyses")
  const ts = useTranslations("samples")
  const tc = useTranslations("common")
  const locale = useLocale()
  const em = useErrorMessage()

  const [grid, setGrid] = useState<Grid | null>(null)
  const [loading, setLoading] = useState(true)
  const [cells, setCells] = useState<Record<string, Cell>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/animals/${animalId}/grid`)
    if (res.ok) {
      const data: Grid = await res.json()
      setGrid(data)
      const map: Record<string, Cell> = {}
      for (const a of data.analyses) {
        map[keyOf(a.sampleId, a.pathogenId, a.examTypeId)] = {
          result: a.result,
          ctValue: a.ctValue,
          notes: a.notes,
        }
      }
      setCells(map)
    }
    setLoading(false)
  }, [animalId])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  const getCell = (k: string): Cell => cells[k] ?? { result: null, ctValue: null, notes: null }

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

    const res = await fetch("/api/analyses", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sampleId: sample.id,
        pathogenId: entry.pathogenId,
        examTypeId: entry.examTypeId,
        result: next.result,
        ctValue: next.ctValue,
        notes: next.notes,
      }),
    })
    if (!res.ok) {
      toast.error(t("saveError"), { description: em(await res.json().catch(() => ({}))) })
      setCells((c) => ({ ...c, [k]: prev })) // reverte
      return
    }
    toast.success(t("saved"))
  }

  if (loading) return <p className="text-sm text-muted-foreground">{tc("loading")}</p>
  if (!grid) return null
  if (grid.protocol.length === 0)
    return <p className="text-sm text-muted-foreground">{t("noProtocol")}</p>
  if (grid.samples.length === 0)
    return <p className="text-sm text-muted-foreground">{t("noSamples")}</p>

  return (
    <div className="space-y-8">
      {grid.samples.map((sample) => {
        const entries = grid.protocol.filter((p) => p.organId === sample.organ.id)
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
                      <TableHead className="w-24">{t("colCt")}</TableHead>
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
                                <SelectItem value="POSITIVO">{t("resultPositive")}</SelectItem>
                                <SelectItem value="NEGATIVO">{t("resultNegative")}</SelectItem>
                                <SelectItem value="INCONCLUSIVO">
                                  {t("resultInconclusive")}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <CtInput
                              value={cell.ctValue}
                              placeholder={t("ctPlaceholder")}
                              onCommit={(n) => {
                                if (n !== cell.ctValue) save(sample, entry, { ctValue: n })
                              }}
                            />
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
  )
}

// Inputs não controlados que só disparam save no blur (evita PUT a cada tecla).
function CtInput({
  value,
  placeholder,
  onCommit,
}: {
  value: number | null
  placeholder: string
  onCommit: (n: number | null) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <Input
      ref={ref}
      key={value ?? ""}
      defaultValue={value ?? ""}
      type="number"
      step="any"
      placeholder={placeholder}
      className="h-8"
      onBlur={(e) => {
        const raw = e.target.value.trim()
        onCommit(raw === "" ? null : Number(raw))
      }}
    />
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
