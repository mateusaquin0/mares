"use client"

import { useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { AlertTriangle, Pencil, Plus, Trash2, X } from "lucide-react"

import { pathogenName, txt } from "@/lib/catalog-i18n"
import { useErrorMessage } from "@/lib/use-error-message"
import { usePathogens, useExamTypes } from "@/hooks/use-catalog"
import { useDeleteConfirmation, useSaveConfirmation } from "@/hooks/use-analyses"
import type { AnalysisRow, PathogenLite, ResultValue } from "@/types/analysis"
import type { ConfirmationPayload } from "@/services/analyses"
import { ResultDot, ResultSelect } from "@/components/analysis-cells"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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

// Resumo textual de uma sequência (marcador · acesso · % identidade).
function seqSummary(s: AnalysisRow["sequences"][number]): string {
  return [s.marker, s.accession, s.pctIdentity != null ? `${s.pctIdentity}%` : null]
    .filter(Boolean)
    .join(" · ")
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

  return (
    <div className="space-y-3 rounded-md border border-dashed bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("confirmTitle")}
        </span>
        {!editing && (
          <Button variant="outline" size="sm" className="h-7 gap-1" onClick={openNew}>
            <Plus className="size-3.5" />
            {t("confirmAdd")}
          </Button>
        )}
      </div>

      {!parentIsPositive && confirmations.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-[hsl(35_80%_40%)]">
          <AlertTriangle className="size-3.5 shrink-0" />
          {t("confirmOrphanWarning")}
        </p>
      )}

      {/* Lista de confirmações existentes */}
      {confirmations.length === 0 && !editing ? (
        <p className="text-xs text-muted-foreground">{t("confirmEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {confirmations.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border bg-background px-2.5 py-1.5"
            >
              <span className="flex items-center gap-2 font-medium">
                <ResultDot result={c.result} />
                <Truncate className="max-w-[16rem]">{pathogenName(locale, c.pathogen)}</Truncate>
              </span>
              <span className="text-xs text-muted-foreground">{txt(locale, c.examType.name)}</span>
              {c.sequences.map((s) => (
                <Badge key={s.id} variant="secondary" className="font-normal">
                  {seqSummary(s) || t("seqEmpty")}
                </Badge>
              ))}
              <span className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => openEdit(c)}
                  aria-label={t("confirmEdit")}
                >
                  <Pencil className="size-3.5" />
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
                      className="size-7 text-destructive"
                      aria-label={t("confirmDelete")}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  }
                />
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Editor (novo ou edição) */}
      {editing && (
        <div className="space-y-3 rounded border bg-background p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-xs font-medium">{t("confirmSpecies")}</span>
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
            <div className="space-y-1">
              <span className="text-xs font-medium">{t("confirmExam")}</span>
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
            <label className="space-y-1">
              <span className="text-xs font-medium">{t("colResult")}</span>
              <ResultSelect
                value={form.result}
                onChange={(result) => setForm((f) => ({ ...f, result }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium">{t("colNotes")}</span>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder={t("notesPlaceholder")}
                className="h-8"
              />
            </label>
          </div>

          {/* Sequências */}
          <div className="space-y-2">
            <span className="text-xs font-medium">{t("seqTitle")}</span>
            {form.sequences.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  value={s.marker}
                  onChange={(e) => setSeq(i, { marker: e.target.value })}
                  placeholder={t("seqMarker")}
                  className="h-8 w-32"
                />
                <Input
                  value={s.accession}
                  onChange={(e) => setSeq(i, { accession: e.target.value })}
                  placeholder={t("seqAccession")}
                  className="h-8 w-36"
                />
                <Input
                  value={s.pctIdentity}
                  onChange={(e) => setSeq(i, { pctIdentity: e.target.value })}
                  placeholder={t("seqIdentity")}
                  type="number"
                  step="any"
                  className="h-8 w-28"
                />
                <Input
                  value={s.platform}
                  onChange={(e) => setSeq(i, { platform: e.target.value })}
                  placeholder={t("seqPlatform")}
                  className="h-8 w-32"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={() => removeSeq(i)}
                  aria-label={t("seqRemove")}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={addSeq}>
              <Plus className="size-3.5" />
              {t("seqAdd")}
            </Button>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={cancel} disabled={saveM.isPending}>
              {tc("cancel")}
            </Button>
            <Button size="sm" onClick={save} disabled={!canSave || saveM.isPending}>
              {tc("save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
