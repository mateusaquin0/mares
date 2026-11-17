"use client"

import { useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { AlertTriangle, Pencil, Plus, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { pathogenName, txt } from "@/lib/catalog-i18n"
import { useErrorMessage } from "@/lib/use-error-message"
import { usePathogens, useExamTypes } from "@/hooks/use-catalog"
import { useDeleteConfirmation, useSaveConfirmation } from "@/hooks/use-analyses"
import type { AnalysisRow, PathogenLite, ResultValue } from "@/types/analysis"
import type { ConfirmationPayload } from "@/services/analyses"
import { RESULT_META, ResultSelect } from "@/components/analysis-cells"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Truncate } from "@/components/ui/truncate"
import { Combobox } from "@/components/ui/combobox"

type SeqForm = { marker: string; accession: string; pctIdentity: string; platform: string }
type FormState = {
  pathogenId: string
  examTypeId: string
  result: ResultValue | null
  notes: string
  sequences: SeqForm[]
}

const emptySeq = (): SeqForm => ({ marker: "", accession: "", pctIdentity: "", platform: "" })

function toForm(row: AnalysisRow | null, defaultExamId: string): FormState {
  if (!row)
    return {
      pathogenId: "",
      examTypeId: defaultExamId,
      result: "POSITIVO",
      notes: "",
      sequences: [emptySeq()],
    }
  return {
    pathogenId: row.pathogenId,
    examTypeId: row.examTypeId,
    result: row.result,
    notes: row.notes ?? "",
    sequences: row.sequences.length
      ? row.sequences.map((s) => ({
          marker: s.marker ?? "",
          accession: s.accession ?? "",
          pctIdentity: s.pctIdentity != null ? String(s.pctIdentity) : "",
          platform: s.platform ?? "",
        }))
      : [emptySeq()],
  }
}

export function ConfirmationPanel({
  animalId,
  parentId,
  screeningPathogen,
  confirmations,
  parentIsPositive,
}: {
  animalId: string
  parentId: string
  screeningPathogen: PathogenLite
  confirmations: AnalysisRow[]
  parentIsPositive: boolean
}) {
  const t = useTranslations("analyses")
  const tc = useTranslations("common")
  const tp = useTranslations("protocol")
  const locale = useLocale()
  const em = useErrorMessage()

  const pathogensQ = usePathogens()
  const examTypesQ = useExamTypes()
  const saveM = useSaveConfirmation(animalId)
  const deleteM = useDeleteConfirmation(animalId)

  // editing: null = sem editor; { childId: null } = novo; { childId } = editando existente.
  const [editing, setEditing] = useState<{ childId: string | null } | null>(null)
  const [form, setForm] = useState<FormState>(() => toForm(null, ""))

  const exams = examTypesQ.data ?? []
  // Pré-seleciona um exame de sequenciamento (heurística pelo nome), senão o primeiro.
  const seqExam = exams.find((e) => /sequen/i.test(txt(locale, e.name))) ?? exams[0]
  const defaultExamId = seqExam?.id ?? ""

  // Sugestão de espécie: patógenos da mesma família do rastreio; sem correspondência, todos.
  const allPathogens = pathogensQ.data ?? []
  const family = screeningPathogen.taxonFamily ?? null
  const familyMatches = family ? allPathogens.filter((p) => p.taxonFamily === family) : []
  const speciesOptions = (familyMatches.length ? familyMatches : allPathogens)
    .slice()
    .sort((a, b) => pathogenName(locale, a).localeCompare(pathogenName(locale, b), locale))
    .map((p) => ({ value: p.id, label: pathogenName(locale, p) }))
  const examOptions = exams.map((e) => ({ value: e.id, label: txt(locale, e.name) }))

  // Estado vazio dos autocompletes: leva ao glossário na aba certa (mesmo padrão do protocolo).
  const glossaryLink = (tab: "pathogens" | "exam-types") => (
    <Link href={`/app/catalogs?tab=${tab}`} className="text-sm font-medium text-primary underline">
      {tp("goToGlossary")}
    </Link>
  )

  function openNew() {
    setForm(toForm(null, defaultExamId))
    setEditing({ childId: null })
  }
  function openEdit(row: AnalysisRow) {
    setForm(toForm(row, defaultExamId))
    setEditing({ childId: row.id })
  }
  function cancel() {
    setEditing(null)
  }

  function setSeq(i: number, patch: Partial<SeqForm>) {
    setForm((f) => ({
      ...f,
      sequences: f.sequences.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }))
  }
  function addSeq() {
    setForm((f) => ({ ...f, sequences: [...f.sequences, emptySeq()] }))
  }
  function removeSeq(i: number) {
    setForm((f) => ({ ...f, sequences: f.sequences.filter((_, idx) => idx !== i) }))
  }

  async function save() {
    const payload: ConfirmationPayload = {
      pathogenId: form.pathogenId,
      examTypeId: form.examTypeId,
      result: form.result,
      notes: form.notes.trim() || null,
      sequences: form.sequences
        .map((s) => ({
          marker: s.marker.trim() || null,
          accession: s.accession.trim() || null,
          pctIdentity: s.pctIdentity.trim() === "" ? null : Number(s.pctIdentity),
          consensus: null,
          platform: s.platform.trim() || null,
        }))
        // Descarta linhas totalmente vazias.
        .filter((s) => s.marker || s.accession || s.pctIdentity != null || s.platform),
    }
    try {
      await saveM.mutateAsync({ parentId, childId: editing?.childId ?? null, data: payload })
      toast.success(t("saved"))
      setEditing(null)
    } catch (err) {
      toast.error(t("saveError"), { description: em(err) })
    }
  }

  async function remove(childId: string) {
    try {
      await deleteM.mutateAsync(childId)
      toast.success(t("saved"))
    } catch (err) {
      toast.error(t("saveError"), { description: em(err) })
    }
  }

  const canSave = !!form.pathogenId && !!form.examTypeId

  const fieldLabel = "text-xs font-semibold leading-[14px] text-muted-foreground"
  const seqGrid = "grid grid-cols-[120px_150px_110px_minmax(0,1fr)] gap-x-3"

  return (
    <div className="mb-0 ml-4 border-l-2 border-l-foreground pb-2.5 pl-3 pt-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-[.05em] text-muted-foreground">
          {t("confirmTitle")}
        </span>
        <span className="flex-1" />
        {!editing && (
          <Button variant="outline" size="sm" className="h-[26px]" onClick={openNew}>
            <Plus className="size-4" />
            {t("confirmAdd")}
          </Button>
        )}
      </div>

      {!parentIsPositive && confirmations.length > 0 && (
        <p className="mt-1.5 flex items-center gap-2 rounded-sm border border-warning bg-warning-subtle px-2.5 py-1 font-semibold text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          {t("confirmOrphanWarning")}
        </p>
      )}

      {confirmations.length === 0 && !editing ? (
        <p className="mt-1 text-[13px] text-muted-foreground">{t("confirmEmpty")}</p>
      ) : (
        <ul>
          {confirmations.map((c) => {
            const meta = RESULT_META[c.result ?? "UNTESTED"]
            const Icon = meta.icon
            return (
              <li key={c.id} className="mt-1">
                <div className="flex flex-wrap items-baseline gap-x-2.5">
                  <span
                    title={t("colResult")}
                    className={cn(
                      "inline-flex items-center gap-1 self-center text-[13px] font-semibold",
                      c.result === "POSITIVO" && "text-positive",
                      c.result === "INCONCLUSIVO" && "text-warning",
                      c.result === null && "font-normal text-muted-foreground",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {t(meta.labelKey)}
                  </span>
                  <Truncate
                    className={cn(
                      "max-w-[20rem] font-medium",
                      c.pathogen.scientificName && "font-serif text-base italic",
                    )}
                  >
                    {pathogenName(locale, c.pathogen)}
                  </Truncate>
                  <span className="text-muted-foreground">{txt(locale, c.examType.name)}</span>
                  {c.notes && <span className="text-muted-foreground">· {c.notes}</span>}
                  <span className="flex-1" />
                  <span className="flex items-center gap-0.5 self-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      onClick={() => openEdit(c)}
                      aria-label={t("confirmEdit")}
                      title={t("confirmEdit")}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <ConfirmDialog
                      destructive
                      title={t("confirmDeleteTitle")}
                      description={t("confirmDeleteDesc")}
                      onConfirm={() => remove(c.id)}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          aria-label={t("confirmDelete")}
                          title={t("confirmDelete")}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      }
                    />
                  </span>
                </div>
                {c.sequences.length > 0 && (
                  <div className="mt-1">
                    <div
                      className={cn(
                        seqGrid,
                        "border-b border-border py-[3px] text-xs font-bold uppercase tracking-[.05em] text-muted-foreground",
                      )}
                    >
                      <span>{t("seqMarker")}</span>
                      <span>{t("seqAccession")}</span>
                      <span className="text-right">{t("seqIdentity")}</span>
                      <span>{t("seqPlatform")}</span>
                    </div>
                    {c.sequences.map((s) => (
                      <div
                        key={s.id}
                        className={cn(seqGrid, "border-b border-border py-1 last:border-b-0")}
                      >
                        <span>{s.marker || "—"}</span>
                        <span>{s.accession || "—"}</span>
                        <span className="text-right tabular-nums">{s.pctIdentity ?? "—"}</span>
                        <span>{s.platform || "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <div className="mt-2 space-y-2.5 rounded-sm border border-input bg-popover px-3 py-2.5">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
            <div className="grid min-w-0 gap-0.5">
              <span className={fieldLabel}>{t("confirmSpecies")}</span>
              <Combobox
                options={speciesOptions}
                value={form.pathogenId || undefined}
                onChange={(v) => setForm((f) => ({ ...f, pathogenId: v }))}
                placeholder={t("confirmSpeciesPlaceholder")}
                searchPlaceholder={tc("search")}
                emptyText={tp("selectEmpty")}
                emptyAction={glossaryLink("pathogens")}
                loading={pathogensQ.isLoading}
              />
            </div>
            <div className="grid min-w-0 gap-0.5">
              <span className={fieldLabel}>{t("confirmExam")}</span>
              <Combobox
                options={examOptions}
                value={form.examTypeId || undefined}
                onChange={(v) => setForm((f) => ({ ...f, examTypeId: v }))}
                placeholder={t("confirmExamPlaceholder")}
                searchPlaceholder={tc("search")}
                emptyText={tp("selectEmpty")}
                emptyAction={glossaryLink("exam-types")}
                loading={examTypesQ.isLoading}
              />
            </div>
            <label className="grid min-w-0 gap-0.5">
              <span className={fieldLabel}>{t("colResult")}</span>
              <ResultSelect
                value={form.result}
                onChange={(result) => setForm((f) => ({ ...f, result }))}
              />
            </label>
            <label className="grid min-w-0 gap-0.5">
              <span className={fieldLabel}>{t("colNotes")}</span>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder={t("notesPlaceholder")}
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <span className={fieldLabel}>{t("seqTitle")}</span>
            {form.sequences.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  value={s.marker}
                  onChange={(e) => setSeq(i, { marker: e.target.value })}
                  placeholder={t("seqMarker")}
                  className="w-32"
                />
                <Input
                  value={s.accession}
                  onChange={(e) => setSeq(i, { accession: e.target.value })}
                  placeholder={t("seqAccession")}
                  className="w-36"
                />
                <Input
                  value={s.pctIdentity}
                  onChange={(e) => setSeq(i, { pctIdentity: e.target.value })}
                  placeholder={t("seqIdentity")}
                  type="number"
                  step="any"
                  className="w-28 text-right"
                />
                <Input
                  value={s.platform}
                  onChange={(e) => setSeq(i, { platform: e.target.value })}
                  placeholder={t("seqPlatform")}
                  className="w-32"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={() => removeSeq(i)}
                  aria-label={t("seqRemove")}
                  title={t("seqRemove")}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="h-[26px]" onClick={addSeq}>
              <Plus className="size-4" />
              {t("seqAdd")}
            </Button>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={cancel} disabled={saveM.isPending}>
              {tc("cancel")}
            </Button>
            <Button onClick={save} disabled={!canSave || saveM.isPending}>
              {tc("save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
