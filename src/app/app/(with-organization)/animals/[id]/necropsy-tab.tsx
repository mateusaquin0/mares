"use client"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  ArrowRight,
  ChevronRight,
  Info,
  Pencil,
  MoveHorizontal,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { txt } from "@/lib/catalog-i18n"
import { LIMITS } from "@/schemas/limits"
import { useErrorMessage } from "@/lib/use-error-message"
import {
  DISTRIBUTION_OPTIONS,
  NECROPSY_STATUS_OPTIONS,
  SEVERITY_OPTIONS,
  type NecropsyStatusValue,
} from "@/lib/necropsy-enums"
import {
  useDeleteGrossFinding,
  useDeleteHistopathology,
  useNecropsy,
  useRemoveNecropsySystem,
  useSetNecropsySystem,
} from "@/hooks/use-necropsy"
import { useCatalogList } from "@/hooks/use-catalog"
import type { GrossFinding, HistopathologyFinding } from "@/types/necropsy"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"
import { Truncate } from "@/components/ui/truncate"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  NecropsyStatusBadge,
  NecropsyStatusIcon,
  useNecropsyStatusLabel,
  type NecropsyStatusOrUnset,
} from "@/components/necropsy-status-badge"
import { GrossFindingDialog, HistopathologyDialog } from "./necropsy-dialogs"
import { NecropsyScreeningSection } from "./necropsy-screening"

// ── Diálogo do motivo de "não examinado" ─────────────────────────────────────
// O motivo é obrigatório nesse estado (o schema recusa sem ele): perguntá-lo na hora da
// escolha evita salvar um "não examinado" pela metade e ter de voltar para completar.
function ReasonDialog({
  open,
  systemLabel,
  initial,
  saving,
  onCancel,
  onConfirm,
}: {
  open: boolean
  systemLabel: string
  initial: string
  saving: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const t = useTranslations("necropsy")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const [reason, setReason] = useState(initial)
  const [touched, setTouched] = useState(false)
  const invalid = touched && !reason.trim()

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("reasonTitle")}</DialogTitle>
          <p className="text-sm text-muted-foreground">{systemLabel}</p>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setTouched(true)
            if (reason.trim()) onConfirm(reason.trim())
          }}
          className="flex flex-col gap-4"
        >
          <DialogBody>
            <div className="space-y-1">
              <Label htmlFor="not-examined-reason">{t("reasonLabel")}</Label>
              <Input
                id="not-examined-reason"
                autoFocus
                maxLength={LIMITS.shortText}
                placeholder={t("reasonPlaceholder")}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {invalid && <p className="text-xs text-destructive">{tval("required")}</p>}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={saving}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Tabela de achados macroscópicos de um sistema ────────────────────────────

// Recompõe "órgão / tecido / local" para leitura. O SISTEMA fica de fora: ele é o cabeçalho
// da seção onde a tabela vive, e repeti-lo em toda linha só consumiria largura.
function topographyOf(f: GrossFinding, locale: string): string {
  return [f.organ ? txt(locale, f.organ.name) : null, f.tissue, f.site].filter(Boolean).join(" / ")
}

/**
 * Tabela de achados macroscópicos: uma linha por achado, com as nove colunas do formato do
 * SIMBA e rolagem horizontal própria.
 *
 * As nove colunas não cabem nos ~900px do cartão, e comprimi-las custava informação — os três
 * campos de parasita viravam um só, as observações truncavam. Aqui a tabela tem a largura de
 * que precisa e rola dentro da própria caixa; `overscroll-x-contain` impede que esse gesto
 * seja repassado à página quando chega ao fim.
 *
 * `table-fixed` + colgroup, e não larguras nas <th>: com layout automático o navegador
 * distribui a sobra entre as colunas e a de Nº estica, deixando o número solto num vão.
 */
function FindingsTable({
  findings,
  locale,
  onAdd,
  onEdit,
  onDelete,
}: {
  findings: GrossFinding[]
  locale: string
  onAdd: () => void
  onEdit: (f: GrossFinding) => void
  onDelete: (f: GrossFinding) => void
}) {
  const t = useTranslations("necropsy")
  const tc = useTranslations("common")

  const label = (options: readonly { value: string; key: string }[], value: string | null) => {
    const o = options.find((x) => x.value === value)
    return o ? t(o.key) : null
  }

  // `null` é "não informado", e não "não": em itálico apagado, para não se confundir com um
  // "Não" afirmado (que diz que se procurou e nada havia).
  const Tri = ({ value }: { value: boolean | null }) =>
    value === null ? (
      <span className="italic text-muted-foreground">{t("notInformed")}</span>
    ) : (
      <span className="font-medium">{value ? t("yes") : t("no")}</span>
    )

  return (
    /* `contain: paint` é a garantia de nível de especificação de que NADA dentro desta
       caixa afeta layout, pintura ou área rolável fora dela. `overflow: hidden` só clipa o
       visual — a tabela larga aqui dentro ainda inflava a área de rolagem do DOCUMENTO (a
       janela ganhava barras com os cantos vazios) ao ser aberta no accordion. */
    <div className="overflow-hidden rounded-lg border bg-background [contain:paint]">
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="min-w-[1312px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-12" />
            <col className="w-52" />
            <col className="w-36" />
            <col className="w-28" />
            <col className="w-28" />
            <col className="w-72" />
            <col className="w-28" />
            <col className="w-28" />
            <col className="w-24" />
            <col className="w-20" />
          </colgroup>
          <thead>
            <tr className="[&_th]:bg-accent [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:align-bottom [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-accent-foreground">
              <th>{t("colNumber")}</th>
              <th>{t("colTopography")}</th>
              <th>{t("colLesion")}</th>
              <th>{t("colDistribution")}</th>
              <th>{t("colSeverity")}</th>
              <th>{t("colNotes")}</th>
              <th className="border-l">{t("colParasitesPresent")}</th>
              <th>{t("colParasitesCollected")}</th>
              <th>{t("colParasiteCount")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => (
              <tr key={f.id} className="border-t align-top [&>td]:px-3 [&>td]:py-3">
                <td className="font-semibold tabular-nums text-muted-foreground">
                  {String(f.position).padStart(2, "0")}
                </td>
                {/* As três colunas de texto livre são limitadas em altura: sem isto uma lesão
                    de 255 caracteres ou uma observação de 500 transformam a linha numa torre
                    e desalinham tudo ao lado. O `Truncate` expõe o texto inteiro no tooltip
                    nativo quando corta. */}
                <td className="font-medium">
                  {topographyOf(f, locale) ? (
                    <Truncate lines={2} className="max-w-none">
                      {topographyOf(f, locale)}
                    </Truncate>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="font-medium">
                  <Truncate lines={2} className="max-w-none">
                    {f.lesion}
                  </Truncate>
                </td>
                <td className="text-muted-foreground">
                  {label(DISTRIBUTION_OPTIONS, f.distribution) ?? "—"}
                </td>
                <td className="text-muted-foreground">
                  {label(SEVERITY_OPTIONS, f.severity) ?? "—"}
                </td>
                <td className="text-muted-foreground">
                  {f.notes ? (
                    <Truncate lines={3} className="max-w-none">
                      {f.notes}
                    </Truncate>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="border-l">
                  <Tri value={f.parasitesPresent} />
                </td>
                <td>
                  <Tri value={f.parasitesCollected} />
                </td>
                <td className="tabular-nums">
                  {f.parasiteCount === null ? (
                    <span className="italic text-muted-foreground">{t("notInformed")}</span>
                  ) : (
                    <span className="font-medium">{f.parasiteCount}</span>
                  )}
                </td>
                <td>
                  <div className="-mt-1 flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => onEdit(f)}
                      title={tc("edit")}
                    >
                      <Pencil className="size-4" />
                      <span className="sr-only">{tc("edit")}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(f)}
                      title={tc("delete")}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">{tc("delete")}</span>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MoveHorizontal className="size-3.5" />
          {t("scrollHint")}
        </span>
        <Button variant="outline" size="sm" className="border-dashed" onClick={onAdd}>
          <Plus className="size-4" />
          {t("addFinding")}
        </Button>
      </div>
    </div>
  )
}

// ── Cabeçalho de uma das três partes do laudo ────────────────────────────────
// O resumo à direita é o que a parte FECHADA continua contando (respostas preenchidas,
// sistemas avaliados, achados registrados) — sem ele, o accordion esconderia o progresso.
// O `flex-1` deixa a seta do gatilho encostada na borda, como na aba de análises.
function SectionHeading({ title, summary }: { title: string; summary: string }) {
  return (
    <span className="flex flex-1 flex-wrap items-center gap-3">
      <span className="text-lg font-semibold">{title}</span>
      <span className="ml-auto shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {summary}
      </span>
    </span>
  )
}

// ── Aba ──────────────────────────────────────────────────────────────────────

export function NecropsyTab({ animalId }: { animalId: string }) {
  const t = useTranslations("necropsy")
  const tc = useTranslations("common")
  const locale = useLocale()
  const em = useErrorMessage()

  const reportQ = useNecropsy(animalId)
  // Catálogo de sistemas pelo hook genérico de glossário — sistema é um catálogo comum.
  const catalogQ = useCatalogList("systems")
  const setSystemM = useSetNecropsySystem(animalId)
  const removeSystemM = useRemoveNecropsySystem(animalId)
  const deleteFindingM = useDeleteGrossFinding(animalId)
  const deleteHistoM = useDeleteHistopathology(animalId)
  const statusLabel = useNecropsyStatusLabel()

  const [openSystems, setOpenSystems] = useState<Set<string>>(new Set())
  const [findingDialog, setFindingDialog] = useState<{
    systemId: string
    row?: GrossFinding
  } | null>(null)
  const [histoDialog, setHistoDialog] = useState<{ row?: HistopathologyFinding } | null>(null)
  const [confirmFinding, setConfirmFinding] = useState<GrossFinding | null>(null)
  const [confirmHisto, setConfirmHisto] = useState<HistopathologyFinding | null>(null)
  const [reasonFor, setReasonFor] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const exams = reportQ.data?.systems
  const screening = reportQ.data?.screening
  const histopathology = reportQ.data?.histopathology ?? []
  const catalog = useMemo(() => catalogQ.data ?? [], [catalogQ.data])

  // As linhas são os sistemas DESTE laudo, na ordem em que a necrópsia os percorreu — não
  // uma lista global. Um sistema do catálogo que ninguém acrescentou simplesmente não
  // aparece, e por isso o denominador do contador é estável ao longo do tempo.
  const rows = useMemo(
    () =>
      (exams ?? []).map((e) => ({
        examId: e.id,
        systemId: e.system.id,
        label: txt(locale, e.system.name),
        exam: e,
        status: e.status as NecropsyStatusOrUnset,
        findings: e.findings,
      })),
    [exams, locale],
  )

  // Quantas das quatro perguntas de triagem têm resposta. Mesmo papel do contador do macro:
  // com um accordion por vez, a seção fechada precisa dizer se falta preencher algo nela.
  const screeningAnswered = screening
    ? [
        screening.anthropicInteraction,
        screening.giContentCollected,
        screening.giSolidWaste,
        screening.giDetailedScreening,
      ].filter((v) => v !== null).length
    : 0

  const assessed = rows.filter((r) => r.status !== null).length
  const total = rows.length
  const rowOf = (systemId: string) => rows.find((r) => r.systemId === systemId)
  const systemLabelOf = (systemId: string) => rowOf(systemId)?.label ?? ""
  const findingsOf = (systemId: string) => rowOf(systemId)?.findings ?? []
  // Só o que ainda não está no laudo pode ser acrescentado.
  const available = catalog.filter((c) => !rows.some((r) => r.systemId === c.id))

  const toggleSystem = (system: string) =>
    setOpenSystems((prev) => {
      const next = new Set(prev)
      if (next.has(system)) next.delete(system)
      else next.add(system)
      return next
    })

  async function applyStatus(
    systemId: string,
    status: NecropsyStatusValue | null,
    reason: string | null,
  ) {
    try {
      await setSystemM.mutateAsync({ systemId, status, notExaminedReason: reason })
      setReasonFor(null)
      // Marcar "com alteração" abre o sistema: o passo seguinte é sempre lançar a primeira
      // linha, e deixá-lo fechado esconderia justamente o botão que falta apertar.
      if (status === "ALTERED") setOpenSystems((prev) => new Set(prev).add(systemId))
    } catch (err) {
      // Inclui o 409 de "há achados registrados": a mensagem do erro já explica o motivo e
      // a contagem, então não precisa de tela própria.
      setReasonFor(null)
      toast.error(t("statusError"), { description: em(err) })
    }
  }

  function chooseStatus(systemId: string, status: NecropsyStatusValue) {
    if (status === "NOT_EXAMINED") {
      setReasonFor(systemId)
      return
    }
    void applyStatus(systemId, status, null)
  }

  // Acrescenta o sistema ao laudo sem estado: ele vira item de checklist a preencher.
  async function addSystem(systemId: string) {
    setAdding(false)
    await applyStatus(systemId, null, null)
  }

  async function removeSystem(systemId: string) {
    const row = rowOf(systemId)
    if (!row) return
    try {
      await removeSystemM.mutateAsync(row.examId)
      toast.success(t("systemRemoved"))
    } catch (err) {
      toast.error(t("systemRemoveError"), { description: em(err) })
    }
  }

  async function removeFinding(f: GrossFinding) {
    try {
      await deleteFindingM.mutateAsync(f.id)
      toast.success(t("findingDeleted"))
    } catch (err) {
      toast.error(t("findingDeleteError"), { description: em(err) })
    }
  }

  async function removeHisto(f: HistopathologyFinding) {
    try {
      await deleteHistoM.mutateAsync(f.id)
      toast.success(t("histoDeleted"))
    } catch (err) {
      toast.error(t("histoDeleteError"), { description: em(err) })
    }
  }

  if (reportQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <TableSkeleton rows={5} />
      </div>
    )
  }

  // Falha de carga NÃO pode cair no estado vazio: "nenhum sistema avaliado" é uma afirmação
  // sobre a necrópsia, e exibi-la quando na verdade não se sabe é pior do que não exibir nada.
  if (reportQ.isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <TriangleAlert className="size-8 text-destructive" />
        <p className="font-semibold">{t("loadError")}</p>
        <p className="max-w-md text-sm text-muted-foreground">{em(reportQ.error)}</p>
        <Button variant="outline" size="sm" onClick={() => void reportQ.refetch()}>
          {tc("reload")}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Um único elemento rolável, no molde de samples-tab.tsx: a raiz fica fixa e este
          contêiner absorve tanto a altura (accordion aberto) quanto a largura (tabela de 9
          colunas). `overflow-auto` explícito nos DOIS eixos — deixar o horizontal em
          `visible` fazia o conteúdo largo escapar para a janela. */}
      {/* Mesma razão do `contain:paint` na caixa da tabela, no outro eixo: com o accordion
          aberto o conteúdo cresce e inflava a altura de rolagem do DOCUMENTO, mesmo com este
          contêiner rolando por conta própria. `overflow` clipa o visual; `contain` é o que
          impede o subtree de contribuir para a área rolável de fora. */}
      <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain [contain:paint]">
        {/* As três partes do laudo, uma aberta por vez (`type="single"`): abertas todas
            juntas, a tabela de nove colunas do macro empurrava a histopatologia para fora
            da tela e a rolagem era o único jeito de saber que ela existia. O resumo à
            direita de cada título é o que a seção fechada continua dizendo.
            `collapsible` permite fechar a que está aberta e ver as três de relance. */}
        <Accordion type="single" collapsible defaultValue="screening" className="space-y-3">
          {/* ── Triagem da carcaça ───────────────────────────────────────────── */}
          {/* Vem antes do exame por sistema porque é a leitura da carcaça inteira: interação
              antrópica e conteúdo gastrointestinal valem para o indivíduo, não para um
              sistema. `screening` só falta enquanto a query carrega, o que já foi tratado. */}
          <AccordionItem value="screening">
            <AccordionTrigger>
              <SectionHeading
                title={t("screeningTitle")}
                summary={t("screeningProgress", { answered: screeningAnswered, total: 4 })}
              />
            </AccordionTrigger>
            <AccordionContent className="p-4">
              {screening && <NecropsyScreeningSection animalId={animalId} screening={screening} />}
            </AccordionContent>
          </AccordionItem>

          {/* ── Macroscópico ─────────────────────────────────────────────────── */}
          <AccordionItem value="macro" className="min-w-0">
            <AccordionTrigger>
              <SectionHeading
                title={t("macroTitle")}
                summary={t("progress", { assessed, total })}
              />
            </AccordionTrigger>
            <AccordionContent className="min-w-0 space-y-4 p-4">
              <p className="text-sm text-muted-foreground">{t("macroSubtitle", { total })}</p>

              {total > 0 && assessed === 0 && (
                <div className="flex gap-3 rounded-lg border border-accent-foreground/30 bg-accent/40 p-4">
                  <Info className="mt-0.5 size-5 shrink-0 text-accent-foreground" />
                  <p className="text-sm">{t("macroEmptyHint")}</p>
                </div>
              )}

              {total === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center">
                  <p className="font-semibold text-muted-foreground">{t("noSystemsTitle")}</p>
                  <p className="max-w-xl text-sm text-muted-foreground">
                    {catalog.length === 0 ? t("catalogEmptyHint") : t("noSystemsHint")}
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border">
                  {rows.map((r, i) => {
                    const isOpen = openSystems.has(r.systemId)
                    const unset = r.status === null
                    const expandable = r.status === "ALTERED"
                    return (
                      <div
                        key={r.examId}
                        className={cn(i > 0 && "border-t", unset && "bg-muted/30")}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                          {expandable ? (
                            <button
                              type="button"
                              onClick={() => toggleSystem(r.systemId)}
                              aria-expanded={isOpen}
                              className="flex items-center gap-2.5 text-left font-semibold"
                            >
                              <ChevronRight
                                className={cn(
                                  "size-4 text-muted-foreground transition-transform",
                                  isOpen && "rotate-90",
                                )}
                              />
                              {r.label}
                            </button>
                          ) : (
                            <span
                              className={cn(
                                "flex items-center gap-2.5 font-semibold",
                                unset && "font-medium text-muted-foreground",
                              )}
                            >
                              <ChevronRight className="size-4 text-transparent" />
                              {r.label}
                            </span>
                          )}

                          <div className="flex flex-wrap items-center gap-3">
                            {r.status === "NOT_EXAMINED" && r.exam?.notExaminedReason && (
                              <span className="text-sm text-muted-foreground">
                                {t("reasonPrefix")}{" "}
                                <span className="font-medium text-foreground">
                                  {r.exam.notExaminedReason}
                                </span>
                              </span>
                            )}
                            {expandable && (
                              <span className="text-sm text-muted-foreground">
                                {t("findingCount", { count: r.findings.length })}
                              </span>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={t("changeStatus", { system: r.label })}
                              >
                                <NecropsyStatusBadge status={r.status} className="cursor-pointer" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {NECROPSY_STATUS_OPTIONS.map((o) => (
                                  <DropdownMenuItem
                                    key={o.value}
                                    onSelect={() => chooseStatus(r.systemId, o.value)}
                                  >
                                    <span className="flex items-center gap-2">
                                      <NecropsyStatusIcon status={o.value} />
                                      {statusLabel(o.value)}
                                    </span>
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {/* Tira o sistema DESTE laudo; o catálogo continua intacto. */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() => void removeSystem(r.systemId)}
                              title={t("removeSystem")}
                            >
                              <X className="size-4" />
                              <span className="sr-only">{t("removeSystem")}</span>
                            </Button>
                          </div>
                        </div>

                        {expandable && isOpen && (
                          <div className="px-4 pb-4">
                            {r.findings.length === 0 ? (
                              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
                                <p className="text-sm text-muted-foreground">
                                  {t("noFindingsYet")}
                                </p>
                                <Button
                                  size="sm"
                                  onClick={() => setFindingDialog({ systemId: r.systemId })}
                                >
                                  <Plus className="size-4" />
                                  {t("addFinding")}
                                </Button>
                              </div>
                            ) : (
                              <FindingsTable
                                findings={r.findings}
                                locale={locale}
                                onAdd={() => setFindingDialog({ systemId: r.systemId })}
                                onEdit={(f) => setFindingDialog({ systemId: r.systemId, row: f })}
                                onDelete={(f) => setConfirmFinding(f)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Acrescentar sistema ao laudo. A lista vem do catálogo (aba Sistemas do
            glossário) e exclui o que já está no laudo. */}
              {adding ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-64 flex-1 sm:max-w-sm">
                    <Combobox
                      options={available.map((c) => ({ value: c.id, label: txt(locale, c.name) }))}
                      value=""
                      onChange={(v) => void addSystem(v)}
                      placeholder={t("systemPlaceholder")}
                      searchPlaceholder={tc("search")}
                      emptyText={catalog.length === 0 ? t("catalogEmpty") : t("allSystemsAdded")}
                      loading={catalogQ.isLoading}
                    />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                    {tc("cancel")}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-dashed"
                  onClick={() => setAdding(true)}
                  disabled={catalogQ.isLoading || available.length === 0}
                >
                  <Plus className="size-4" />
                  {t("addSystem")}
                </Button>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* ── Histopatológico ──────────────────────────────────────────────── */}
          <AccordionItem value="micro">
            <AccordionTrigger>
              <SectionHeading
                title={t("microTitle")}
                summary={
                  histopathology.length === 0
                    ? t("microEmpty")
                    : t("microCount", { count: histopathology.length })
                }
              />
            </AccordionTrigger>
            <AccordionContent className="space-y-4 p-4">
              {/* O botão sai do cabeçalho: dentro do gatilho do accordion ele seria um botão
                  aninhado em outro, que o HTML não permite. */}
              <div className="flex flex-wrap justify-end gap-2">
                <Button onClick={() => setHistoDialog({})}>
                  <Plus className="size-4" />
                  {t("addHisto")}
                </Button>
              </div>

              {histopathology.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed bg-muted/30 px-6 py-9 text-center">
                  <p className="font-semibold text-muted-foreground">{t("microEmptyTitle")}</p>
                  <p className="max-w-lg text-sm text-muted-foreground">{t("microEmptyHint")}</p>
                </div>
              ) : (
                <ul className="overflow-hidden rounded-xl border">
                  {histopathology.map((f, i) => (
                    <li
                      key={f.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3",
                        i > 0 && "border-t",
                        i % 2 === 1 && "bg-muted/30",
                      )}
                    >
                      {/* `leading-6` no número E no parágrafo: as duas caixas passam a ter 24px, e
                    a primeira linha do texto fica na mesma altura do número. `tabular-nums`
                    evita o 01/02/10 dançarem de largura. */}
                      <span className="w-6 shrink-0 text-xs font-semibold leading-6 tabular-nums text-muted-foreground">
                        {String(f.position).padStart(2, "0")}
                      </span>
                      {/* Órgão em cima, achado embaixo. Inline, o órgão se perdia no meio de um
                    bloco de texto longo e a quebra ficava irregular. Os rótulos
                    "Órgão:/Achado:" saem porque a estrutura já os diz — o formato corrido do
                    SIMBA continua saindo pelo "copiar diagnóstico descritivo". */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-6">
                          {txt(locale, f.organ.name)}
                        </p>
                        <p className="text-sm leading-6 text-muted-foreground">{f.finding}</p>
                      </div>
                      {/* Botão de 32px sobre linha de 24px: sobe 4px para o centro óptico do
                    ícone cair na primeira linha, em vez de transbordar por baixo. */}
                      <div className="-mt-1 flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setHistoDialog({ row: f })}
                          title={tc("edit")}
                        >
                          <Pencil className="size-4" />
                          <span className="sr-only">{tc("edit")}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmHisto(f)}
                          title={tc("delete")}
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">{tc("delete")}</span>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* ── Diálogos ───────────────────────────────────────────────────────── */}
        {findingDialog && (
          <GrossFindingDialog
            animalId={animalId}
            systemId={findingDialog.systemId}
            systemLabel={systemLabelOf(findingDialog.systemId)}
            row={findingDialog.row}
            nextPosition={findingsOf(findingDialog.systemId).length + 1}
            open
            onClose={() => setFindingDialog(null)}
          />
        )}

        {histoDialog && (
          <HistopathologyDialog
            animalId={animalId}
            row={histoDialog.row}
            open
            onClose={() => setHistoDialog(null)}
          />
        )}

        {reasonFor && (
          <ReasonDialog
            open
            systemLabel={systemLabelOf(reasonFor)}
            initial={rowOf(reasonFor)?.exam.notExaminedReason ?? ""}
            saving={setSystemM.isPending}
            onCancel={() => setReasonFor(null)}
            onConfirm={(reason) => void applyStatus(reasonFor, "NOT_EXAMINED", reason)}
          />
        )}

        {confirmFinding && (
          <ConfirmDialog
            open
            onOpenChange={(o) => !o && setConfirmFinding(null)}
            title={t("deleteFindingTitle")}
            description={t("deleteFindingDesc", { lesion: confirmFinding.lesion })}
            confirmLabel={tc("delete")}
            destructive
            onConfirm={() => removeFinding(confirmFinding)}
          />
        )}

        {confirmHisto && (
          <ConfirmDialog
            open
            onOpenChange={(o) => !o && setConfirmHisto(null)}
            title={t("deleteHistoTitle")}
            description={t("deleteHistoDesc", { organ: txt(locale, confirmHisto.organ.name) })}
            confirmLabel={tc("delete")}
            destructive
            onConfirm={() => removeHisto(confirmHisto)}
          />
        )}
      </div>
    </div>
  )
}

// Resumo de uma linha para a aba "Informações" — o laudo não pode ficar escondido atrás de
// uma aba que ninguém abre.
export function NecropsySummary({ animalId, onOpen }: { animalId: string; onOpen: () => void }) {
  const t = useTranslations("necropsy")
  const reportQ = useNecropsy(animalId)
  const systems = reportQ.data?.systems ?? []
  const altered = systems.filter((s) => s.status === "ALTERED").length
  const micro = reportQ.data?.histopathology.length ?? 0

  if (reportQ.isLoading) return <Skeleton className="h-5 w-72" />

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        {reportQ.isError
          ? // Mesmo motivo do corpo da aba: sem os dados, o resumo não afirma nada.
            t("loadError")
          : systems.length === 0 && micro === 0
            ? t("summaryEmpty")
            : t("summary", { altered, micro })}
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1 font-medium text-accent-foreground underline underline-offset-2"
      >
        {t("summaryOpen")}
        <ArrowRight className="size-3.5" />
      </button>
    </div>
  )
}
