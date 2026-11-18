"use client"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  ChevronRight,
  Info,
  Pencil,
  MoveHorizontal,
  Plus,
  RotateCw,
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
  AccordionSectionTrigger,
} from "@/components/ui/accordion"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DataRow } from "@/components/ui/section"
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
 * Tabela de achados macroscópicos: uma linha por achado, com as colunas do formato do SIMBA.
 *
 * Em 1440px cabe inteira; mais estreita, rola na horizontal dentro da própria caixa, com Nº e
 * Órgão / tecido / local fixos à esquerda. `overscroll-x-contain` impede que o gesto seja
 * repassado à página quando chega ao fim.
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

  const sticky = "sticky z-[1] bg-background"

  return (
    /* `contain: paint`: a tabela larga aqui dentro não pode inflar a área de rolagem do
       documento ao abrir o sistema. */
    <div className="mb-2.5 ml-[26px] border border-border [contain:paint]">
      <div className="overflow-x-auto overflow-y-hidden overscroll-x-contain">
        <table className="w-full min-w-[1140px] table-fixed border-collapse">
          <colgroup>
            <col className="w-11" />
            <col className="w-[200px]" />
            <col />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            <col />
            <col className="w-[100px]" />
            <col className="w-[100px]" />
            <col className="w-[100px]" />
            <col className="w-14" />
          </colgroup>
          <thead>
            <tr className="border-b border-foreground bg-muted text-left align-middle text-xs font-bold uppercase leading-[14px] tracking-[.05em] text-muted-foreground [&>th]:h-[30px] [&>th]:py-1">
              <th className={cn(sticky, "left-0 bg-muted px-2")}>{t("colNumber")}</th>
              <th className={cn(sticky, "left-11 border-r border-border bg-muted pr-2")}>
                {t("colTopography")}
              </th>
              <th className="pl-2.5">{t("colLesion")}</th>
              <th>{t("colDistribution")}</th>
              <th>{t("colSeverity")}</th>
              <th>{t("colNotes")}</th>
              <th className="border-l border-border pl-2">{t("colParasitesPresent")}</th>
              <th>{t("colParasitesCollected")}</th>
              <th>{t("colParasiteCount")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => (
              <tr key={f.id} className="border-b border-border align-middle [&>td]:py-1">
                <td
                  className={cn(
                    sticky,
                    "left-0 px-2 font-semibold tabular-nums text-muted-foreground",
                  )}
                >
                  {String(f.position).padStart(2, "0")}
                </td>
                {/* As colunas de texto livre são limitadas em altura: sem isto uma lesão de 255
                    caracteres ou uma observação de 500 transformam a linha numa torre. O
                    `Truncate` expõe o texto inteiro na dica quando corta. */}
                <td className={cn(sticky, "left-11 border-r border-border pr-2 font-semibold")}>
                  {topographyOf(f, locale) ? (
                    <Truncate lines={2} className="max-w-none">
                      {topographyOf(f, locale)}
                    </Truncate>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2.5 font-medium">
                  <Truncate lines={3} className="max-w-none">
                    {f.lesion}
                  </Truncate>
                </td>
                <td>{label(DISTRIBUTION_OPTIONS, f.distribution) ?? "—"}</td>
                <td>{label(SEVERITY_OPTIONS, f.severity) ?? "—"}</td>
                <td className="pr-2 text-muted-foreground">
                  {f.notes ? (
                    <Truncate lines={3} className="max-w-none">
                      {f.notes}
                    </Truncate>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="border-l border-border pl-2">
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
                  <div className="flex justify-end gap-0.5 pr-1">
                    <IconButton label={tc("edit")} onClick={() => onEdit(f)}>
                      <Pencil />
                    </IconButton>
                    <IconButton label={tc("delete")} destructive onClick={() => onDelete(f)}>
                      <Trash2 />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 bg-popover px-2 py-1.5">
        {/* A dica só faz sentido quando a tabela não cabe (abaixo de 1280px). */}
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground xl:hidden">
          <MoveHorizontal className="size-4" />
          {t("scrollHint")}
        </span>
        <span className="flex-1" />
        <Button variant="outline" size="sm" className="h-[26px]" onClick={onAdd}>
          <Plus className="size-4" />
          {t("addFinding")}
        </Button>
      </div>
    </div>
  )
}

function IconButton({
  label,
  destructive,
  onClick,
  children,
}: {
  label: string
  destructive?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted [&_svg]:size-4",
        destructive ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
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
      <div
        role="alert"
        className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-2.5 gap-y-1 border-b border-t-2 border-b-border border-t-destructive py-3.5"
      >
        <TriangleAlert className="mt-px size-[18px] text-destructive" />
        <b className="font-semibold">{t("loadError")}</b>
        <span />
        <span className="text-muted-foreground">{em(reportQ.error)}</span>
        <span />
        <span>
          <Button
            variant="outline"
            size="sm"
            className="mt-1.5"
            onClick={() => void reportQ.refetch()}
          >
            <RotateCw className="size-4" />
            {tc("reload")}
          </Button>
        </span>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Um único elemento rolável: a raiz fica fixa e este contêiner absorve a altura
          (accordion aberto). `contain: paint` impede que o conteúdo infle a rolagem do
          documento. */}
      <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain [contain:paint]">
        {/* As três partes do laudo, uma aberta por vez: abertas todas juntas, a tabela do
            macro empurrava a histopatologia para fora da tela. O resumo à direita de cada
            título é o que a seção fechada continua dizendo. */}
        <Accordion
          type="single"
          collapsible
          defaultValue="screening"
          className="flex flex-col gap-3.5 pb-8"
        >
          {/* ── Triagem da carcaça ───────────────────────────────────────────── */}
          {/* Vem antes do exame por sistema porque é a leitura da carcaça inteira: interação
              antrópica e conteúdo gastrointestinal valem para o indivíduo, não para um
              sistema. */}
          <AccordionItem value="screening">
            <AccordionSectionTrigger
              title={t("screeningTitle")}
              summary={t("screeningProgress", { answered: screeningAnswered, total: 4 })}
            />
            <AccordionContent className="pb-0 pt-1.5">
              {screening && <NecropsyScreeningSection animalId={animalId} screening={screening} />}
            </AccordionContent>
          </AccordionItem>

          {/* ── Macroscópico ─────────────────────────────────────────────────── */}
          <AccordionItem value="macro" className="min-w-0">
            <AccordionSectionTrigger
              title={t("macroTitle")}
              summary={t("progress", { assessed, total })}
            />
            <AccordionContent className="min-w-0 pb-0 pt-1.5">
              <p className="mb-1 text-[13px] text-muted-foreground">
                {t("macroSubtitle", { total })}
              </p>

              {total > 0 && assessed === 0 && (
                <div
                  role="note"
                  className="my-1.5 grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 border border-info bg-info-subtle px-3 py-2"
                >
                  <Info className="mt-0.5 size-4 text-info" />
                  <span className="text-pretty">{t("macroEmptyHint")}</span>
                </div>
              )}

              {total === 0 ? (
                <div className="my-2 border border-dashed border-input px-6 py-8 text-center">
                  <p className="font-semibold text-muted-foreground">{t("noSystemsTitle")}</p>
                  <p className="mx-auto mt-1 max-w-xl text-muted-foreground">
                    {catalog.length === 0 ? t("catalogEmptyHint") : t("noSystemsHint")}
                  </p>
                </div>
              ) : (
                <div>
                  {rows.map((r) => {
                    const isOpen = openSystems.has(r.systemId)
                    const unset = r.status === null
                    const expandable = r.status === "ALTERED"
                    return (
                      <div key={r.examId} className="border-b border-border">
                        <div className="flex min-h-[38px] items-center gap-3">
                          {expandable ? (
                            <button
                              type="button"
                              onClick={() => toggleSystem(r.systemId)}
                              aria-expanded={isOpen}
                              className="flex items-center gap-3 text-left font-semibold hover:text-primary"
                            >
                              <ChevronRight
                                className={cn(
                                  "size-3.5 shrink-0 text-muted-foreground transition-transform",
                                  isOpen && "rotate-90",
                                )}
                              />
                              {r.label}
                            </button>
                          ) : (
                            <span
                              className={cn(
                                "flex items-center gap-3 font-semibold",
                                unset && "font-medium text-muted-foreground",
                              )}
                            >
                              <span aria-hidden className="w-3.5 shrink-0" />
                              {r.label}
                            </span>
                          )}
                          <span className="flex-1" />

                          {r.status === "NOT_EXAMINED" && r.exam?.notExaminedReason && (
                            <span className="text-muted-foreground">
                              {t("reasonPrefix")}{" "}
                              <b className="font-semibold text-foreground">
                                {r.exam.notExaminedReason}
                              </b>
                            </span>
                          )}
                          {expandable && (
                            <span className="text-muted-foreground">
                              {t("findingCount", { count: r.findings.length })}
                            </span>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={t("changeStatus", { system: r.label })}
                              title={t("changeStatus", { system: r.label })}
                            >
                              <NecropsyStatusBadge status={r.status} selector />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {NECROPSY_STATUS_OPTIONS.map((o) => (
                                <DropdownMenuItem
                                  key={o.value}
                                  onSelect={() => chooseStatus(r.systemId, o.value)}
                                >
                                  <NecropsyStatusIcon status={o.value} />
                                  {statusLabel(o.value)}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {/* Tira o sistema DESTE laudo; o catálogo continua intacto. */}
                          <IconButton
                            label={t("removeSystem")}
                            destructive
                            onClick={() => void removeSystem(r.systemId)}
                          >
                            <X />
                          </IconButton>
                        </div>

                        {expandable &&
                          isOpen &&
                          (r.findings.length === 0 ? (
                            <div className="mb-2.5 ml-[26px] flex flex-wrap items-center gap-3 border border-border px-3 py-2.5">
                              <span className="flex-1 text-muted-foreground">
                                {t("noFindingsYet")}
                              </span>
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
                          ))}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Acrescentar sistema ao laudo. A lista vem do catálogo (aba Sistemas do
                  glossário) e exclui o que já está no laudo. */}
              <div className="mt-2.5">
                {adding ? (
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-64 flex-[0_1_360px]">
                      <Combobox
                        options={available.map((c) => ({
                          value: c.id,
                          label: txt(locale, c.name),
                        }))}
                        value=""
                        onChange={(v) => void addSystem(v)}
                        placeholder={t("systemPlaceholder")}
                        searchPlaceholder={tc("search")}
                        emptyText={catalog.length === 0 ? t("catalogEmpty") : t("allSystemsAdded")}
                        loading={catalogQ.isLoading}
                      />
                    </div>
                    <Button variant="ghost" onClick={() => setAdding(false)}>
                      {tc("cancel")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="border-dashed"
                    onClick={() => setAdding(true)}
                    disabled={catalogQ.isLoading || available.length === 0}
                  >
                    <Plus className="size-4" />
                    {t("addSystem")}
                  </Button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Histopatológico ──────────────────────────────────────────────── */}
          <AccordionItem value="micro">
            <AccordionSectionTrigger
              title={t("microTitle")}
              summary={
                histopathology.length === 0
                  ? t("microEmpty")
                  : t("microCount", { count: histopathology.length })
              }
            />
            <AccordionContent className="pb-0 pt-0">
              {/* O botão fica fora do cabeçalho: dentro do gatilho do accordion ele seria um
                  botão aninhado em outro, que o HTML não permite. */}
              <div className="flex justify-end py-2">
                <Button onClick={() => setHistoDialog({})}>
                  <Plus className="size-4" />
                  {t("addHisto")}
                </Button>
              </div>

              {histopathology.length === 0 ? (
                <div className="border-t border-foreground px-6 py-8 text-center">
                  <p className="font-semibold text-muted-foreground">{t("microEmptyTitle")}</p>
                  <p className="mx-auto mt-1 max-w-lg text-muted-foreground">
                    {t("microEmptyHint")}
                  </p>
                </div>
              ) : (
                <ul className="border-t border-foreground">
                  {histopathology.map((f) => (
                    <li
                      key={f.id}
                      className="grid grid-cols-[32px_minmax(0,1fr)_64px] gap-2 border-b border-border py-2"
                    >
                      <span className="font-semibold tabular-nums text-muted-foreground">
                        {String(f.position).padStart(2, "0")}
                      </span>
                      {/* Órgão em cima, achado embaixo. Os rótulos "Órgão:/Achado:" saem porque
                          a estrutura já os diz — o formato corrido do SIMBA continua saindo pelo
                          "copiar diagnóstico descritivo". */}
                      <span>
                        <b className="block font-semibold">{txt(locale, f.organ.name)}</b>
                        <span className="block text-pretty text-muted-foreground">{f.finding}</span>
                      </span>
                      <span className="-mt-1 flex justify-end gap-0.5">
                        <IconButton label={tc("edit")} onClick={() => setHistoDialog({ row: f })}>
                          <Pencil />
                        </IconButton>
                        <IconButton
                          label={tc("delete")}
                          destructive
                          onClick={() => setConfirmHisto(f)}
                        >
                          <Trash2 />
                        </IconButton>
                      </span>
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
  const ta = useTranslations("animals")
  const reportQ = useNecropsy(animalId)
  const systems = reportQ.data?.systems ?? []
  const altered = systems.filter((s) => s.status === "ALTERED").length
  const micro = reportQ.data?.histopathology.length ?? 0

  return (
    <DataRow
      label={ta("necropsyTab")}
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
      {reportQ.isLoading ? (
        <Skeleton className="h-5 w-72" />
      ) : reportQ.isError ? (
        // Mesmo motivo do corpo da aba: sem os dados, o resumo não afirma nada.
        <span className="text-muted-foreground">{t("loadError")}</span>
      ) : systems.length === 0 && micro === 0 ? (
        <span className="text-muted-foreground">{t("summaryEmpty")}</span>
      ) : (
        t("summary", { altered, micro })
      )}
    </DataRow>
  )
}
