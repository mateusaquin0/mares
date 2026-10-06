"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Download, Plus, Ruler, Trash2 } from "lucide-react"

import { useErrorMessage } from "@/lib/use-error-message"
import { useBiometry, useSaveBiometry, useSimbaBiometry } from "@/hooks/use-biometry"
import {
  filledCount,
  isCountMeasure,
  normalizeLabel,
  unitForMeasure,
  withWeight,
} from "@/lib/biometry"
import { LIMITS } from "@/schemas/limits"
import { MAX_MEASURES } from "@/schemas/biometry.schema"
import type { BiometryMeasure } from "@/types/biometry"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TextSuggest } from "@/components/ui/text-suggest"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"

// Linha em edição: o valor é string porque o input é livre enquanto a pessoa digita
// (vazio = "não informado", que é diferente de zero).
type Row = { label: string; value: string }

const toRows = (ms: readonly BiometryMeasure[]): Row[] =>
  ms.map((m) => ({ label: m.label, value: m.value == null ? "" : String(m.value) }))

export function BiometryTab({ animalId }: { animalId: string }) {
  const t = useTranslations("biometry")
  const tc = useTranslations("common")
  const em = useErrorMessage()

  const q = useBiometry(animalId)
  const saveM = useSaveBiometry(animalId)
  const simbaM = useSimbaBiometry(animalId)

  const [editing, setEditing] = useState(false)
  const [group, setGroup] = useState("")
  const [rows, setRows] = useState<Row[]>([])
  const [confirmImport, setConfirmImport] = useState<{
    group: string | null
    unit: string | null
    rows: Row[]
    changed: number
  } | null>(null)

  const data = q.data
  // O peso mora em `Animal.necropsyWeightKg`; a lista guarda só o rótulo, para a posição no
  // formulário não se perder. Ver lib/biometry.ts §stripWeight.
  const measures = useMemo(
    () => (data?.biometry ? withWeight(data.biometry.measures, data.weightKg) : []),
    [data],
  )
  const unit = data?.biometry?.unit ?? null

  // Sincroniza o formulário com o servidor — MENOS enquanto a pessoa edita: o react-query
  // refaz a consulta em segundo plano (foco na janela, reconexão), e sobrescrever aí apagaria
  // o que ela acabou de digitar.
  useEffect(() => {
    if (!data || editing) return
    setGroup(data.biometry?.group ?? "")
    setRows(toRows(measures))
  }, [data, measures, editing])

  if (q.isLoading) return <TableSkeleton rows={6} />

  const canImport = data?.canImport ?? false
  const total = measures.length
  const filled = filledCount(data?.biometry ? { ...data.biometry, measures } : null)

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  async function save(next?: { group: string | null; unit: string | null; rows: Row[] }) {
    const src = next ?? { group: group.trim() || null, unit, rows }
    const seen = new Set<string>()
    const measuresPayload: BiometryMeasure[] = []
    for (const r of src.rows) {
      const label = r.label.trim()
      if (!label) continue
      // Rótulo repetido tornaria a leitura ambígua e quebraria a comparação entre indivíduos,
      // que é feita pelo rótulo. O servidor também recusa.
      const key = normalizeLabel(label)
      if (seen.has(key)) {
        toast.error(t("duplicateLabel", { label }))
        return
      }
      seen.add(key)
      const raw = r.value.trim().replace(",", ".")
      const value = raw === "" ? null : Number(raw)
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        toast.error(t("invalidValue", { label }))
        return
      }
      measuresPayload.push({ label, value })
    }
    try {
      await saveM.mutateAsync({ group: src.group, unit: src.unit, measures: measuresPayload })
      setEditing(false)
      toast.success(t("saved"))
    } catch (err) {
      toast.error(t("saveError"), { description: em(err) })
    }
  }

  async function importFromSimba() {
    try {
      const preview = await simbaM.mutateAsync()
      if (preview.mismatch) {
        toast.error(t("importMismatch"), {
          description: t("importMismatchDesc", {
            labels: preview.mismatch.labels,
            values: preview.mismatch.values,
          }),
        })
        return
      }
      if (!preview.biometry || preview.biometry.measures.length === 0) {
        toast.info(t("importEmpty"))
        return
      }
      const incoming = withWeight(preview.biometry.measures, preview.weightKg)
      // Quantas medidas o import MUDA em relação ao que está salvo — é o número que decide se
      // vale a pena parar para conferir.
      const atual = new Map(measures.map((m) => [normalizeLabel(m.label), m.value]))
      const changed = incoming.filter((m) => atual.get(normalizeLabel(m.label)) !== m.value).length
      setConfirmImport({
        group: preview.biometry.group,
        unit: preview.biometry.unit,
        rows: toRows(incoming),
        changed,
      })
    } catch (err) {
      toast.error(t("importError"), { description: em(err) })
    }
  }

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("group")}
        </p>
        {editing ? (
          <div className="mt-1 w-64">
            <TextSuggest
              id="biometry-group"
              value={group}
              onChange={setGroup}
              suggestions={data?.knownGroups ?? []}
              placeholder={t("groupPlaceholder")}
              maxLength={LIMITS.tinyText}
            />
          </div>
        ) : (
          <p className="mt-1 text-sm">{data?.biometry?.group || t("groupNone")}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {total > 0 && !editing && (
          <span className="text-sm text-muted-foreground">{t("progress", { filled, total })}</span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={importFromSimba}
          loading={simbaM.isPending}
          disabled={!canImport || editing}
          title={canImport ? t("importTitle") : t("importNoRecord")}
        >
          {!simbaM.isPending && <Download className="size-4" />}
          {t("import")}
        </Button>
        {editing ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              {tc("cancel")}
            </Button>
            <Button size="sm" onClick={() => save()} loading={saveM.isPending}>
              {tc("save")}
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {tc("edit")}
          </Button>
        )}
      </div>
    </div>
  )

  const empty = total === 0 && !editing

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {header}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Ruler className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">{t("emptyTitle")}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {canImport ? t("emptyHintSimba") : t("emptyHint")}
            </p>
          </div>
        ) : editing ? (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Label htmlFor={`bm-label-${i}`} className="sr-only">
                    {t("measure")}
                  </Label>
                  <TextSuggest
                    id={`bm-label-${i}`}
                    value={r.label}
                    onChange={(v) => setRow(i, { label: v })}
                    suggestions={data?.knownLabels ?? []}
                    placeholder={t("measurePlaceholder")}
                    maxLength={LIMITS.name}
                  />
                </div>
                <div className="w-40 shrink-0">
                  <Label htmlFor={`bm-value-${i}`} className="sr-only">
                    {t("value")}
                  </Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id={`bm-value-${i}`}
                      inputMode="decimal"
                      value={r.value}
                      placeholder={t("notInformed")}
                      step={isCountMeasure(r.label) ? 1 : "any"}
                      onChange={(e) => setRow(i, { value: e.target.value })}
                    />
                    <span className="w-10 shrink-0 text-xs text-muted-foreground">
                      {unitForMeasure(r.label, unit)}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("removeMeasure")}
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={rows.length >= MAX_MEASURES}
              onClick={() => setRows((rs) => [...rs, { label: "", value: "" }])}
            >
              <Plus className="size-4" />
              {t("addMeasure")}
            </Button>
          </div>
        ) : (
          // Duas colunas de pares rótulo/valor, como a tela do SIMBA — é a forma que a pessoa
          // já lê, e deixa a comparação entre os dois sistemas direta.
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
            {measures.map((m) => (
              <div
                key={m.label}
                className="flex items-baseline justify-between gap-4 border-b pb-2"
              >
                <dt className="min-w-0 text-sm text-muted-foreground">{m.label}</dt>
                <dd
                  className={
                    m.value == null
                      ? "shrink-0 text-sm italic text-muted-foreground/70"
                      : "shrink-0 text-sm font-medium tabular-nums"
                  }
                >
                  {m.value == null
                    ? t("notInformed")
                    : `${m.value} ${unitForMeasure(m.label, unit)}`}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <ConfirmDialog
        open={confirmImport !== null}
        onOpenChange={(o) => !o && setConfirmImport(null)}
        title={t("importConfirmTitle")}
        description={
          confirmImport
            ? confirmImport.changed > 0
              ? t("importConfirmChanged", {
                  count: confirmImport.rows.length,
                  changed: confirmImport.changed,
                })
              : t("importConfirmSame", { count: confirmImport.rows.length })
            : ""
        }
        confirmLabel={t("importConfirmAction")}
        onConfirm={async () => {
          if (!confirmImport) return
          await save({
            group: confirmImport.group,
            unit: confirmImport.unit,
            rows: confirmImport.rows,
          })
          setConfirmImport(null)
        }}
      />
    </div>
  )
}

/** Resumo para a aba "Dados do encalhe": as medidas âncora e um atalho para a aba. */
export function BiometrySummary({ animalId, onOpen }: { animalId: string; onOpen: () => void }) {
  const t = useTranslations("biometry")
  const q = useBiometry(animalId)
  const data = q.data

  if (q.isLoading) return <TableSkeleton rows={1} />

  const measures = data?.biometry ? withWeight(data.biometry.measures, data.weightKg) : []
  const filled = measures.filter((m) => m.value != null)

  if (filled.length === 0) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        {t("summaryEmpty")}
      </button>
    )
  }

  return (
    <button type="button" onClick={onOpen} className="group block w-full text-left">
      <p className="text-sm">
        {t("progress", { filled: filled.length, total: measures.length })}
        {data?.biometry?.group ? ` · ${data.biometry.group}` : ""}
      </p>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground group-hover:text-foreground">
        {filled
          .slice(0, 3)
          .map((m) => `${m.label}: ${m.value} ${unitForMeasure(m.label, data?.biometry?.unit)}`)
          .join(" · ")}
      </p>
    </button>
  )
}
