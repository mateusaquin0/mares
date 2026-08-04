"use client"

import { useState } from "react"
import Link from "next/link"
import { Controller, useForm } from "react-hook-form"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { BarChart3, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"

import type { CatalogType } from "@/schemas/catalog.schema"
import { LIMITS } from "@/schemas/limits"
import { useNcbiSearch } from "@/hooks/use-ncbi"
import {
  useCatalogList,
  usePathogenGroups,
  useCreateCatalogItem,
  useUpdateCatalogItem,
  useDeleteCatalogItem,
  useCatalogUsage,
} from "@/hooks/use-catalog"
import { useCreateCatalogRequest, useReviewableRequests } from "@/hooks/use-catalog-request"
import type { CatalogRow as Row, NamedRow, PathogenRow } from "@/types/catalog"
import { TaxonAutocomplete } from "@/components/taxon-autocomplete"
import { txt, pathogenName, type I18nText } from "@/lib/catalog-i18n"
import { useErrorMessage } from "@/lib/use-error-message"
import { useTable } from "@/lib/use-table"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { TableSkeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SortableHead } from "@/components/ui/sortable-head"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Truncate } from "@/components/ui/truncate"
import { ReloadButton } from "@/components/ui/reload-button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
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

type FormShape = {
  namePt?: string
  nameEn?: string
  sci?: string
  // Só para exam-types: rótulo/unidade da medida quantitativa (Ct, Título...).
  measurePt?: string
  measureEn?: string
  measureUnit?: string
}

const i18nPt = (v: string | I18nText | null | undefined) =>
  v == null ? "" : typeof v === "string" ? v : (v.pt ?? "")
const i18nEn = (v: string | I18nText | null | undefined) =>
  v == null ? "" : typeof v === "string" ? v : (v.en ?? "")

export function CatalogManager({
  userId,
  isSystemAdmin,
  canManage,
  isReviewer,
  initialType = "organs",
}: {
  userId: string
  isSystemAdmin: boolean
  // Admin da org (ou global) pode adicionar itens; pesquisador só lê (e pode SOLICITAR).
  canManage: boolean
  // Curador (admin de grupo ou global): vê a fila de solicitações pendentes.
  isReviewer: boolean
  initialType?: CatalogType
}) {
  const t = useTranslations("catalogs")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const locale = useLocale()
  const em = useErrorMessage()

  const [type, setType] = useState<CatalogType>(initialType)
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; row?: Row } | null>(null)
  const [confirmRow, setConfirmRow] = useState<Row | null>(null)
  // Táxon do patógeno FORA do react-hook-form: com shouldUnregister, campos nunca registrados
  // (estes, que só são preenchidos programaticamente) não restauram no reset() da edição.
  const [taxonId, setTaxonId] = useState<number | null>(null)
  const [taxon, setTaxon] = useState<{ family: string; order: string; rank: string }>({
    family: "",
    order: "",
    rank: "",
  })
  // Nome científico não veio do NCBI ao tentar criar (regra: exige seleção da base).
  const [ncbiError, setNcbiError] = useState(false)
  // Exam-types: o item tem uma leitura quantitativa (Ct, Título...)?
  const [hasMeasure, setHasMeasure] = useState(false)
  const isPathogen = type === "pathogens"
  const isExamType = type === "exam-types"

  const createM = useCreateCatalogItem(type)
  const updateM = useUpdateCatalogItem(type)
  const deleteM = useDeleteCatalogItem(type)
  // Pesquisador solicita em vez de criar direto.
  const requestM = useCreateCatalogRequest()
  // Contador de pendências para o botão da fila (só curadores).
  const pendingQ = useReviewableRequests("PENDING", isReviewer)
  const pendingCount = pendingQ.data?.length ?? 0

  // Editar/excluir: admin global sempre; senão, o criador enquanto o item não estiver em uso.
  const canModify = (r: Row) => isSystemAdmin || (r.createdById === userId && !r.inUse)

  const taxonSearch = useNcbiSearch()

  const listQ = useCatalogList(type)
  const groupsQ = usePathogenGroups(isPathogen)
  const groups = groupsQ.data ?? []

  const form = useForm<FormShape>({
    // shouldUnregister: campos ocultos (condicionais por grupo) saem da validação.
    shouldUnregister: true,
    defaultValues: { namePt: "", nameEn: "", sci: "" },
  })
  // groupId fica fora do react-hook-form (Select controlado) para pré-seleção confiável ao editar
  // (com shouldUnregister, o reset() não restaura campos não-registrados).
  const [groupId, setGroupId] = useState("")
  const [groupError, setGroupError] = useState(false)
  const selectedGroup = groups.find((g) => g.id === groupId)
  const groupUsesSci = selectedGroup?.usesScientificName ?? true
  // Resumo do táxon exibido abaixo do nome científico (rank · família · ordem).
  const taxonSummary = [taxon.rank, taxon.family, taxon.order].filter(Boolean).join(" · ")

  function openCreate() {
    setGroupId("")
    setGroupError(false)
    setNcbiError(false)
    setTaxonId(null)
    setTaxon({ family: "", order: "", rank: "" })
    setHasMeasure(false)
    form.reset({
      namePt: "",
      nameEn: "",
      sci: "",
      measurePt: "",
      measureEn: "",
      measureUnit: "",
    })
    setDialog({ mode: "create" })
  }
  function openEdit(row: Row) {
    setGroupError(false)
    setNcbiError(false)
    if (isPathogen) {
      const p = row as PathogenRow
      setGroupId(p.group.id)
      setTaxonId(p.taxonId)
      // Restaura o táxon do banco (aparece abaixo do nome científico já na abertura).
      setTaxon({
        family: p.taxonFamily ?? "",
        order: p.taxonOrder ?? "",
        rank: p.taxonRank ?? "",
      })
      setHasMeasure(false)
      form.reset({
        sci: p.scientificName ?? "",
        namePt: i18nPt(p.name),
        nameEn: i18nEn(p.name),
      })
    } else {
      setGroupId("")
      setTaxonId(null)
      setTaxon({ family: "", order: "", rank: "" })
      const n = row as NamedRow
      const measured = isExamType && n.measureLabel != null
      setHasMeasure(measured)
      form.reset({
        namePt: i18nPt(n.name),
        nameEn: i18nEn(n.name),
        measurePt: i18nPt(n.measureLabel),
        measureEn: i18nEn(n.measureLabel),
        measureUnit: n.measureUnit ?? "",
      })
    }
    setDialog({ mode: "edit", row })
  }

  async function onSubmit(data: FormShape) {
    if (isPathogen && !groupId) {
      setGroupError(true)
      return
    }
    const isEdit = dialog?.mode === "edit"
    // Regra: criar patógeno de grupo científico exige seleção do NCBI (taxonId vinculado).
    // Só no cadastro (não na edição, para não travar itens legados sem vínculo).
    if (!isEdit && isPathogen && groupUsesSci && !taxonId) {
      setNcbiError(true)
      return
    }
    const body = isPathogen
      ? {
          groupId,
          scientificName: data.sci,
          namePt: data.namePt,
          nameEn: data.nameEn,
          taxonFamily: taxon.family,
          taxonOrder: taxon.order,
          taxonRank: taxon.rank,
          taxonId,
        }
      : isExamType
        ? {
            namePt: data.namePt,
            nameEn: data.nameEn,
            // hasMeasure desligado → envia vazio, e o servidor grava medida nula.
            measurePt: hasMeasure ? data.measurePt : "",
            measureEn: hasMeasure ? data.measureEn : "",
            measureUnit: hasMeasure ? data.measureUnit : "",
          }
        : { namePt: data.namePt, nameEn: data.nameEn }
    try {
      if (isEdit) {
        await updateM.mutateAsync({ id: dialog!.row!.id, body })
        toast.success(t("updated"))
      } else if (canManage) {
        await createM.mutateAsync(body)
        toast.success(t("created"))
      } else {
        // Pesquisador: abre solicitação de inclusão (curadoria aprova depois).
        await requestM.mutateAsync({ type, payload: body })
        toast.success(t("requestSent"))
      }
      setDialog(null)
    } catch (err) {
      const key = isEdit ? "updateError" : canManage ? "createError" : "requestError"
      toast.error(t(key), { description: em(err) })
    }
  }

  async function remove(row: Row) {
    try {
      await deleteM.mutateAsync(row.id)
      toast.success(t("deleted"))
    } catch (err) {
      toast.error(t("deleteError"), { description: em(err) })
    }
  }

  const display = (r: Row) =>
    isPathogen ? pathogenName(locale, r as PathogenRow) : i18nPt((r as NamedRow).name)

  const table = useTable(listQ.data ?? [], {
    locale,
    resetKey: type,
    initialSort: { key: isPathogen ? "name" : "namePt" },
    columns: isPathogen
      ? {
          name: (r) => pathogenName(locale, r as PathogenRow),
          group: (r) => txt(locale, (r as PathogenRow).group.name),
        }
      : {
          namePt: (r) => i18nPt((r as NamedRow).name),
          nameEn: (r) => i18nEn((r as NamedRow).name),
        },
    search: (r) =>
      isPathogen
        ? [
            pathogenName(locale, r as PathogenRow),
            (r as PathogenRow).scientificName ?? "",
            i18nPt((r as PathogenRow).name),
            i18nEn((r as PathogenRow).name),
            txt(locale, (r as PathogenRow).group.name),
          ].join(" ")
        : [i18nPt((r as NamedRow).name), i18nEn((r as NamedRow).name)].join(" "),
  })

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isReviewer && (
            <Button asChild variant="outline">
              <Link href="/app/catalogs/requests">
                {t("reviewQueue")}
                {/* Bolinha laranja de pendência (mesmo indicador do menu lateral). */}
                {pendingCount > 0 && (
                  <span
                    role="status"
                    aria-label={t("pending", { count: pendingCount })}
                    title={t("pending", { count: pendingCount })}
                    className="ml-1 size-2 shrink-0 rounded-full bg-orange-500"
                  />
                )}
              </Link>
            </Button>
          )}
          {!canManage && (
            <Button asChild variant="ghost">
              <Link href="/app/catalogs/my-requests">{t("myRequests")}</Link>
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            {canManage ? t("add") : t("request")}
          </Button>
        </div>
      </div>

      <Tabs value={type} onValueChange={(v) => setType(v as CatalogType)}>
        <TabsList>
          <TabsTrigger value="organs">{t("tabOrgans")}</TabsTrigger>
          <TabsTrigger value="pathogens">{t("tabPathogens")}</TabsTrigger>
          <TabsTrigger value="exam-types">{t("tabExamTypes")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {listQ.isLoading ? (
        <TableSkeleton />
      ) : (listQ.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <Input
            value={table.query}
            onChange={(e) => table.setQuery(e.target.value)}
            placeholder={tc("search")}
            className="max-w-sm"
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-card">
            {/* Rolagem contida na tabela (o <div overflow-auto> interno recebe h-full). */}
            <div className="min-h-0 flex-1 [&>div]:h-full">
              <Table>
                <TableHeader className="sticky top-0 z-10 [&_th]:bg-accent">
                  <TableRow>
                    {isPathogen ? (
                      <>
                        <SortableHead sortKey="name" sort={table.sort} onToggle={table.toggleSort}>
                          {t("colName")}
                        </SortableHead>
                        <SortableHead sortKey="group" sort={table.sort} onToggle={table.toggleSort}>
                          {t("colGroup")}
                        </SortableHead>
                      </>
                    ) : (
                      <>
                        <SortableHead
                          sortKey="namePt"
                          sort={table.sort}
                          onToggle={table.toggleSort}
                        >
                          {t("colNamePt")}
                        </SortableHead>
                        <SortableHead
                          sortKey="nameEn"
                          sort={table.sort}
                          onToggle={table.toggleSort}
                        >
                          {t("colNameEn")}
                        </SortableHead>
                      </>
                    )}
                    <TableHead className="w-32 text-right">
                      <ReloadButton />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                        {tc("noResults")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.rows.map((r) => (
                      <TableRow key={r.id}>
                        {isPathogen ? (
                          <>
                            <TableCell className="font-medium">
                              <Truncate>{display(r)}</Truncate>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              <Truncate>{txt(locale, (r as PathogenRow).group.name)}</Truncate>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-medium">
                              <Truncate>{i18nPt((r as NamedRow).name)}</Truncate>
                            </TableCell>
                            <TableCell>
                              <Truncate>{i18nEn((r as NamedRow).name)}</Truncate>
                            </TableCell>
                          </>
                        )}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isSystemAdmin && <UsageIndicator type={type} id={r.id} />}
                            {canModify(r) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-8">
                                    <MoreHorizontal className="size-4" />
                                    <span className="sr-only">{tc("actions")}</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={() => openEdit(r)}>
                                    <Pencil className="size-4" />
                                    {tc("edit")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => setConfirmRow(r)}
                                  >
                                    <Trash2 className="size-4" />
                                    {tc("delete")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {confirmRow && (
        <ConfirmDialog
          open={!!confirmRow}
          onOpenChange={(o) => !o && setConfirmRow(null)}
          title={t("deleteTitle")}
          description={t("deleteDesc", { name: display(confirmRow) })}
          confirmLabel={tc("delete")}
          destructive
          onConfirm={() => remove(confirmRow)}
        />
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent dirty={form.formState.isDirty}>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit"
                ? t("editTitle")
                : canManage
                  ? t("addTitle")
                  : t("requestTitle")}
            </DialogTitle>
            <DialogDescription>
              {!canManage && dialog?.mode === "create"
                ? t("requestDesc")
                : isPathogen
                  ? t("addDescPathogen")
                  : t("addDesc")}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col gap-4"
          >
            <DialogBody className="space-y-4">
              {isPathogen && (
                <div className="space-y-1">
                  <Label>{t("group")}</Label>
                  <Select
                    value={groupId}
                    onValueChange={(v) => {
                      setGroupId(v)
                      setGroupError(false)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("groupPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {txt(locale, g.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {groupError && <p className="text-xs text-destructive">{tval("required")}</p>}
                </div>
              )}

              {isPathogen && groupUsesSci ? (
                <div className="space-y-1">
                  <Label htmlFor="sci">{t("nameSci")}</Label>
                  <Controller
                    control={form.control}
                    name="sci"
                    rules={{ required: tval("required") }}
                    render={({ field }) => (
                      <TaxonAutocomplete
                        id="sci"
                        value={field.value ?? ""}
                        invalid={!!form.formState.errors.sci}
                        searchingText={t("ncbiSearching")}
                        emptyText={t("ncbiEmpty")}
                        search={taxonSearch}
                        onChange={(name, m) => {
                          field.onChange(name)
                          // Ao escolher no NCBI, vincula o táxon; edição manual desvincula.
                          setTaxonId(m ? m.id : null)
                          setTaxon({
                            family: m?.family ?? "",
                            order: m?.order ?? "",
                            rank: m?.rank ?? "",
                          })
                          setNcbiError(false)
                        }}
                      />
                    )}
                  />
                  {form.formState.errors.sci && (
                    <p className="text-xs text-destructive">{form.formState.errors.sci.message}</p>
                  )}
                  {ncbiError && <p className="text-xs text-destructive">{t("ncbiRequired")}</p>}
                  {taxonId != null ? (
                    <p className="text-xs text-muted-foreground">
                      {t("ncbiLinked", { taxonId, taxon: taxonSummary || "—" })}
                    </p>
                  ) : taxonSummary ? (
                    <p className="text-xs text-muted-foreground">
                      {t("taxonInfo", { taxon: taxonSummary })}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="namePt">{t("namePt")}</Label>
                    <Input
                      id="namePt"
                      maxLength={LIMITS.name}
                      {...form.register("namePt", { required: tval("required") })}
                    />
                    {form.formState.errors.namePt && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.namePt.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="nameEn">{t("nameEn")}</Label>
                    <Input
                      id="nameEn"
                      maxLength={LIMITS.name}
                      {...form.register("nameEn", { required: tval("required") })}
                    />
                    {form.formState.errors.nameEn && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.nameEn.message}
                      </p>
                    )}
                  </div>

                  {isExamType && (
                    <div className="space-y-3 rounded-lg border border-dashed p-3">
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id="hasMeasure"
                          checked={hasMeasure}
                          onCheckedChange={(v) => setHasMeasure(v === true)}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor="hasMeasure"
                          className="text-sm font-normal text-muted-foreground"
                        >
                          {t("hasMeasure")}
                        </Label>
                      </div>
                      {hasMeasure && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label htmlFor="measurePt">{t("measurePt")}</Label>
                              <Input
                                id="measurePt"
                                placeholder={t("measurePlaceholder")}
                                maxLength={LIMITS.tinyText}
                                {...form.register("measurePt", { required: tval("required") })}
                              />
                              {form.formState.errors.measurePt && (
                                <p className="text-xs text-destructive">
                                  {form.formState.errors.measurePt.message}
                                </p>
                              )}
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="measureEn">{t("measureEn")}</Label>
                              <Input
                                id="measureEn"
                                placeholder={t("measurePlaceholder")}
                                maxLength={LIMITS.tinyText}
                                {...form.register("measureEn", { required: tval("required") })}
                              />
                              {form.formState.errors.measureEn && (
                                <p className="text-xs text-destructive">
                                  {form.formState.errors.measureEn.message}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="measureUnit">{t("measureUnit")}</Label>
                            <Input
                              id="measureUnit"
                              placeholder={t("measureUnitPlaceholder")}
                              maxLength={LIMITS.measureUnit}
                              {...form.register("measureUnit")}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                {!canManage && dialog?.mode === "create" ? t("sendRequest") : tc("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Indicador de uso (só admin global): abre um popover que busca sob demanda quantas
// pesquisas / grupos referenciam o item. Só contagens — nunca ids (privacidade).
function UsageIndicator({ type, id }: { type: CatalogType; id: string }) {
  const t = useTranslations("catalogs")
  const [open, setOpen] = useState(false)
  const usageQ = useCatalogUsage(type, id, open)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" title={t("usageTitle")}>
          <BarChart3 className="size-4" />
          <span className="sr-only">{t("usageTitle")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 text-sm">
        <p className="mb-2 font-medium">{t("usageTitle")}</p>
        {usageQ.isLoading || !usageQ.data ? (
          <p className="text-muted-foreground">{t("usageLoading")}</p>
        ) : (
          <ul className="space-y-1 text-muted-foreground">
            <li>{t("usageResearches", { count: usageQ.data.researches })}</li>
            <li>{t("usageOrgs", { count: usageQ.data.orgs })}</li>
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
