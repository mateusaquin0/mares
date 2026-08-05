"use client"

import { useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  ArrowLeft,
  Ban,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react"

import { type CreateResearchData } from "@/schemas/research.schema"
import {
  useResearch,
  useUpdateResearch,
  useAddProtocol,
  useSetProtocolStatus,
  useRemoveProtocol,
} from "@/hooks/use-research"
import { useOrgans, usePathogens, useExamTypes } from "@/hooks/use-catalog"
import type { CatalogItem } from "@/types/catalog"
import { txt, pathogenName } from "@/lib/catalog-i18n"
import { useErrorMessage } from "@/lib/use-error-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { MultiCombobox } from "@/components/ui/multi-combobox"
import { ResearchMembers } from "./research-members"
import { ResearchFormDialog } from "../research-form-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Truncate } from "@/components/ui/truncate"
import { ReloadButton } from "@/components/ui/reload-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/confirm-dialog"

export function ResearchDetail({
  id,
  isOrgAdmin,
  selfId,
}: {
  id: string
  isOrgAdmin: boolean
  selfId: string
}) {
  const t = useTranslations("research")
  const tp = useTranslations("protocol")
  const tc = useTranslations("common")
  const locale = useLocale()
  const em = useErrorMessage()

  const researchQ = useResearch(id)
  const organsQ = useOrgans()
  const pathogensQ = usePathogens()
  const examTypesQ = useExamTypes()
  const updateM = useUpdateResearch(id)
  const addM = useAddProtocol(id)
  const statusM = useSetProtocolStatus(id)
  const removeM = useRemoveProtocol(id)

  const [organId, setOrganId] = useState<string>()
  const [pathogenIds, setPathogenIds] = useState<string[]>([])
  const [examTypeId, setExamTypeId] = useState<string>()
  const [editOpen, setEditOpen] = useState(false)
  const [protocolQuery, setProtocolQuery] = useState("")
  const [showInactive, setShowInactive] = useState(false)
  // Confirmação destrutiva/desativação disparada pelo menu de ações de uma linha.
  const [confirm, setConfirm] = useState<{ id: string; mode: "delete" | "deactivate" } | null>(null)

  const research = researchQ.data
  const canEditContent = isOrgAdmin || research?.createdById === selfId

  const opts = (list: CatalogItem[] | undefined): ComboboxOption[] =>
    (list ?? []).map((c) => ({ value: c.id, label: txt(locale, c.name) }))

  // Estado vazio do select de protocolo: leva ao glossário já na aba certa.
  const glossaryLink = (tab: "organs" | "pathogens" | "exam-types") => (
    <Link href={`/app/catalogs?tab=${tab}`} className="text-sm font-medium text-primary underline">
      {tp("goToGlossary")}
    </Link>
  )

  const allProtocols = research?.protocols ?? []
  const hasInactive = allProtocols.some((p) => p.status === "INACTIVE")
  const protocolSearch = protocolQuery.trim().toLowerCase()
  const filteredProtocols = allProtocols.filter((p) => {
    // Inativos ficam ocultos por padrão; o toggle "Mostrar inativos" os revela (em leitura).
    if (p.status === "INACTIVE" && !showInactive) return false
    if (!protocolSearch) return true
    return (
      txt(locale, p.organ.name).toLowerCase().includes(protocolSearch) ||
      pathogenName(locale, p.pathogen).toLowerCase().includes(protocolSearch) ||
      txt(locale, p.examType.name).toLowerCase().includes(protocolSearch)
    )
  })

  const editValues = research
    ? {
        name: research.name,
        description: research.description ?? "",
        isPublic: research.isPublic,
      }
    : undefined

  async function onEdit(data: CreateResearchData) {
    try {
      await updateM.mutateAsync(data)
      toast.success(t("edited"))
      setEditOpen(false)
    } catch (err) {
      toast.error(t("editError"), { description: em(err) })
    }
  }

  async function addEntry() {
    if (!organId || pathogenIds.length === 0 || !examTypeId) return
    try {
      const res = await addM.mutateAsync(
        pathogenIds.map((pathogenId) => ({ organId, pathogenId, examTypeId })),
      )
      toast.success(tp("added", { count: res?.added ?? pathogenIds.length }))
      setOrganId(undefined)
      setPathogenIds([])
      setExamTypeId(undefined)
    } catch (err) {
      toast.error(tp("addError"), { description: em(err) })
    }
  }

  async function removeEntry(entryId: string) {
    try {
      await removeM.mutateAsync(entryId)
      toast.success(tp("removed"))
    } catch (err) {
      toast.error(tp("removeError"), { description: em(err) })
    }
  }

  async function setStatus(entryId: string, status: "ACTIVE" | "INACTIVE") {
    try {
      await statusM.mutateAsync({ entryId, status })
      toast.success(status === "INACTIVE" ? tp("deactivated") : tp("reactivated"))
    } catch (err) {
      toast.error(tp("statusError"), { description: em(err) })
    }
  }

  if (researchQ.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <TableSkeleton rows={4} />
      </div>
    )
  }
  if (!research) {
    return <p className="p-8 text-sm text-muted-foreground">{t("notFound")}</p>
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <Link
        href="/app/research"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="min-w-0 break-words text-3xl font-semibold tracking-tight">
              {research.name}
            </h1>
            <Badge variant={research.isPublic ? "public" : "private"} className="shrink-0">
              {research.isPublic ? t("public") : t("private")}
            </Badge>
          </div>
          {research.description && (
            <p className="mt-1 max-w-2xl break-words text-sm text-muted-foreground">
              {research.description}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {t("animalsCount", { count: research._count.animals })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEditContent && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              {tc("edit")}
            </Button>
          )}
        </div>
      </div>

      <Accordion type="single" collapsible defaultValue="protocol" className="space-y-3">
        <AccordionItem value="protocol">
          <AccordionTrigger>{tp("title")}</AccordionTrigger>
          <AccordionContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{tp("subtitle")}</p>
            {/* Sem gate de papel: gerir o protocolo = enxergar a pesquisa. O admin da org
                enxerga todas as pesquisas da org; o pesquisador, só aquelas às quais está
                vinculado. Se a pesquisa carregou aqui, o usuário já pode editá-la — a rota
                aplica a mesma regra (RESEARCHER + assertResearchVisible). */}
            <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Combobox
                options={opts(examTypesQ.data)}
                value={examTypeId}
                onChange={setExamTypeId}
                placeholder={tp("examType")}
                searchPlaceholder={tc("search")}
                emptyText={tp("selectEmpty")}
                emptyAction={glossaryLink("exam-types")}
                loading={examTypesQ.isLoading}
              />
              <MultiCombobox
                options={(pathogensQ.data ?? []).map((c) => ({
                  value: c.id,
                  label: pathogenName(locale, c),
                }))}
                value={pathogenIds}
                onChange={setPathogenIds}
                placeholder={tp("pathogen")}
                summary={(n) => tp("pathogenSelected", { count: n })}
                searchPlaceholder={tc("search")}
                emptyText={tp("selectEmpty")}
                emptyAction={glossaryLink("pathogens")}
                loading={pathogensQ.isLoading}
              />
              <Combobox
                options={opts(organsQ.data)}
                value={organId}
                onChange={setOrganId}
                placeholder={tp("organ")}
                searchPlaceholder={tc("search")}
                emptyText={tp("selectEmpty")}
                emptyAction={glossaryLink("organs")}
                loading={organsQ.isLoading}
              />
              <Button
                onClick={addEntry}
                disabled={!organId || pathogenIds.length === 0 || !examTypeId}
                loading={addM.isPending}
              >
                <Plus className="size-4" />
                {tc("add")}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative max-w-sm flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={protocolQuery}
                  onChange={(e) => setProtocolQuery(e.target.value)}
                  placeholder={tp("searchPlaceholder")}
                  className="pl-9"
                />
              </div>
              {hasInactive && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={showInactive}
                    onCheckedChange={(v) => setShowInactive(v === true)}
                  />
                  {tp("showInactive")}
                </label>
              )}
            </div>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tp("examType")}</TableHead>
                    <TableHead>{tp("pathogen")}</TableHead>
                    <TableHead>{tp("organ")}</TableHead>
                    <TableHead className="w-16 text-right">
                      <ReloadButton />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProtocols.length === 0 && (
                    <TableEmpty colSpan={4}>
                      {research.protocols.length === 0 ? tp("empty") : tc("noResults")}
                    </TableEmpty>
                  )}
                  {filteredProtocols.map((p) => {
                    const inactive = p.status === "INACTIVE"
                    return (
                      <TableRow
                        key={p.id}
                        className={inactive ? "text-muted-foreground" : undefined}
                      >
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <Truncate>{txt(locale, p.examType.name)}</Truncate>
                            {inactive && <Badge variant="secondary">{tp("inactive")}</Badge>}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Truncate>{pathogenName(locale, p.pathogen)}</Truncate>
                        </TableCell>
                        <TableCell>
                          <Truncate>{txt(locale, p.organ.name)}</Truncate>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={tp("actions")}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {inactive ? (
                                <DropdownMenuItem onClick={() => setStatus(p.id, "ACTIVE")}>
                                  <RotateCcw className="size-4" />
                                  {tp("reactivate")}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => setConfirm({ id: p.id, mode: "deactivate" })}
                                >
                                  <Ban className="size-4" />
                                  {tp("deactivate")}
                                </DropdownMenuItem>
                              )}
                              {/* Excluir é irreversível (apaga as análises da combinação):
                                  só admin da org ou criador da pesquisa — mesma regra da rota
                                  DELETE. Os demais vinculados desativam. */}
                              {canEditContent && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setConfirm({ id: p.id, mode: "delete" })}
                                  >
                                    <Trash2 className="size-4" />
                                    {tp("delete")}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="members">
          <AccordionTrigger>{t("membersTitle")}</AccordionTrigger>
          <AccordionContent>
            <ResearchMembers
              researchId={id}
              researchName={research.name}
              orgId={research.orgId}
              selfId={selfId}
              isOrgAdmin={isOrgAdmin}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive={confirm?.mode === "delete"}
        title={confirm?.mode === "delete" ? tp("deleteTitle") : tp("deactivateTitle")}
        description={confirm?.mode === "delete" ? tp("deleteDesc") : tp("deactivateDesc")}
        confirmLabel={confirm?.mode === "delete" ? tp("delete") : tp("deactivate")}
        onConfirm={async () => {
          if (!confirm) return
          if (confirm.mode === "delete") await removeEntry(confirm.id)
          else await setStatus(confirm.id, "INACTIVE")
        }}
      />

      <ResearchFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        canEditVisibility={canEditContent}
        initial={editValues}
        onSubmit={onEdit}
      />
    </div>
  )
}
