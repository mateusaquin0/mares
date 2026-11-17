"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Download, Pencil, Plus, Trash2 } from "lucide-react"

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
import { DataRow } from "@/components/ui/section"
import { TextSuggest } from "@/components/ui/text-suggest"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"
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
    <div className="flex min-h-10 flex-wrap items-center gap-3">
      <span className="text-muted-foreground">{t("group")}</span>
      {editing ? (
        <div className="w-[220px]">
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
        <b className="font-semibold">{data?.biometry?.group || t("groupNone")}</b>
      )}
      {total > 0 && !editing && (
        <>
          <span aria-hidden className="h-[18px] w-px bg-border" />
          <span className="text-muted-foreground">{t("progress", { filled, total })}</span>
        </>
      )}
      <span className="flex-1" />
      <Button
        variant="outline"
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
          <Button variant="outline" onClick={() => setEditing(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => save()} loading={saveM.isPending}>
            {tc("save")}
          </Button>
        </>
      ) : (
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
          {tc("edit")}
        </Button>
      )}
    </div>
  )

  const empty = total === 0 && !editing

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {/* Duas colunas de pares rótulo/valor, como a tela do SIMBA — é a forma que a pessoa
            já lê, e deixa a comparação entre os dois sistemas direta. */}
        {editing ? (
          <div className="columns-2 gap-x-10 border-t-2 border-foreground">
            {rows.map((r, i) => (
              <div
                key={i}
                className="grid break-inside-avoid grid-cols-[minmax(0,1fr)_84px_20px_24px] items-center gap-2 border-b border-border py-[3px]"
              >
                <div className="min-w-0">
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
                <div>
                  <Label htmlFor={`bm-value-${i}`} className="sr-only">
                    {t("value")}
                  </Label>
                  <Input
                    id={`bm-value-${i}`}
                    inputMode="decimal"
                    className="h-[26px] px-1.5 text-right tabular-nums"
                    value={r.value}
                    placeholder="—"
                    title={t("notInformed")}
                    step={isCountMeasure(r.label) ? 1 : "any"}
                    onChange={(e) => setRow(i, { value: e.target.value })}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {unitForMeasure(r.label, unit)}
                </span>
                <button
                  type="button"
                  aria-label={t("removeMeasure")}
                  title={t("removeMeasure")}
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  className="flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <dl className="columns-2 gap-x-10 border-t-2 border-foreground">
            {measures.map((m) => (
              <div
                key={m.label}
                className="grid break-inside-avoid grid-cols-[minmax(0,1fr)_84px] gap-3 border-b border-border py-[5px]"
              >
                <dt className="min-w-0">{m.label}</dt>
                {m.value == null ? (
                  <dd className="text-right text-muted-foreground" title={t("notInformed")}>
                    <span aria-hidden>—</span>
                    <span className="sr-only">{t("notInformed")}</span>
                  </dd>
                ) : (
                  <dd className="text-right font-semibold tabular-nums">
                    {`${m.value} ${unitForMeasure(m.label, unit)}`}
                  </dd>
                )}
              </div>
            ))}
          </dl>
        )}

        {empty && (
          <div className="border-b border-foreground pb-6 pt-[22px]">
            <p className="font-serif text-xl font-medium">{t("emptyTitle")}</p>
            <p className="mt-1 text-muted-foreground">
              {canImport ? t("emptyHintSimba") : t("emptyHint")}
            </p>
          </div>
        )}

        {editing && (
          <Button
            variant="outline"
            className="mt-2.5"
            disabled={rows.length >= MAX_MEASURES}
            onClick={() => setRows((rs) => [...rs, { label: "", value: "" }])}
          >
            <Plus className="size-4" />
            {t("addMeasure")}
          </Button>
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
  const ta = useTranslations("animals")
  const q = useBiometry(animalId)
  const data = q.data

  const measures = data?.biometry ? withWeight(data.biometry.measures, data.weightKg) : []
  const filled = measures.filter((m) => m.value != null)

  return (
    <DataRow
      label={ta("biometryTab")}
      labelWidth="21%"
      className="py-1.5"
      action={
        <button
          type="button"
          onClick={onOpen}
          className="underline underline-offset-2 hover:text-primary"
        >
          {t("summaryOpen")}
        </button>
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-5 w-72" />
      ) : filled.length === 0 ? (
        <span className="text-muted-foreground">{t("summaryEmpty")}</span>
      ) : (
        <>
          {t("progress", { filled: filled.length, total: measures.length })}
          {data?.biometry?.group ? ` · ${data.biometry.group}` : ""}
          <span className="mt-0.5 line-clamp-2 block text-muted-foreground">
            {filled
              .slice(0, 3)
              .map((m) => `${m.label}: ${m.value} ${unitForMeasure(m.label, data?.biometry?.unit)}`)
              .join(" · ")}
          </span>
        </>
      )}
    </DataRow>
  )
}
