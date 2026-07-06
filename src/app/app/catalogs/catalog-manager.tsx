"use client"

import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"

import type { CatalogType } from "@/schemas/catalog.schema"
import { useNcbiSearch } from "@/hooks/use-ncbi"
import {
  useCatalogList,
  usePathogenGroups,
  useCreateCatalogItem,
  useUpdateCatalogItem,
  useDeleteCatalogItem,
} from "@/hooks/use-catalog"
import type { CatalogRow as Row, NamedRow, PathogenRow } from "@/types/catalog"
import { TaxonAutocomplete } from "@/components/taxon-autocomplete"
import { txt, pathogenName, type I18nText } from "@/lib/catalog-i18n"
import { useErrorMessage } from "@/lib/use-error-message"
import { useTable } from "@/lib/use-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import {
  Dialog,
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
  taxonFamily?: string
  taxonOrder?: string
}

const i18nPt = (v: string | I18nText | null | undefined) =>
  v == null ? "" : typeof v === "string" ? v : v.pt ?? ""
const i18nEn = (v: string | I18nText | null | undefined) =>
  v == null ? "" : typeof v === "string" ? v : v.en ?? ""

export function CatalogManager({
  userId,
  isSystemAdmin,
}: {
  userId: string
  isSystemAdmin: boolean
}) {
  const t = useTranslations("catalogs")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const locale = useLocale()
  const em = useErrorMessage()

  const [type, setType] = useState<CatalogType>("organs")
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; row?: Row } | null>(null)
  const [confirmRow, setConfirmRow] = useState<Row | null>(null)
  // Táxon NCBI selecionado para o patógeno (fora do react-hook-form por ser numérico).
  const [taxonId, setTaxonId] = useState<number | null>(null)
  const isPathogen = type === "pathogens"

  const createM = useCreateCatalogItem(type)
  const updateM = useUpdateCatalogItem(type)
  const deleteM = useDeleteCatalogItem(type)

  // Editar/excluir: admin global sempre; senão, o criador enquanto o item não estiver em uso.
  const canModify = (r: Row) =>
    isSystemAdmin || (r.createdById === userId && !r.inUse)

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

  function openCreate() {
    setGroupId("")
    setGroupError(false)
    setTaxonId(null)
    form.reset({ namePt: "", nameEn: "", sci: "", taxonFamily: "", taxonOrder: "" })
    setDialog({ mode: "create" })
  }
  function openEdit(row: Row) {
    setGroupError(false)
    if (isPathogen) {
      const p = row as PathogenRow
      setGroupId(p.group.id)
      setTaxonId(p.taxonId)
      form.reset({
        sci: p.scientificName ?? "",
        namePt: i18nPt(p.name),
        nameEn: i18nEn(p.name),
        taxonFamily: p.taxonFamily ?? "",
        taxonOrder: p.taxonOrder ?? "",
      })
    } else {
      setGroupId("")
      setTaxonId(null)
      const n = row as NamedRow
      form.reset({ namePt: i18nPt(n.name), nameEn: i18nEn(n.name) })
    }
    setDialog({ mode: "edit", row })
  }

  async function onSubmit(data: FormShape) {
    if (isPathogen && !groupId) {
      setGroupError(true)
      return
    }
    const isEdit = dialog?.mode === "edit"
    const body = isPathogen
      ? {
          groupId,
          scientificName: data.sci,
          namePt: data.namePt,
          nameEn: data.nameEn,
          taxonFamily: data.taxonFamily,
          taxonOrder: data.taxonOrder,
          taxonId,
        }
      : { namePt: data.namePt, nameEn: data.nameEn }
    try {
      if (isEdit) await updateM.mutateAsync({ id: dialog!.row!.id, body })
      else await createM.mutateAsync(body)
      toast.success(isEdit ? t("updated") : t("created"))
      setDialog(null)
    } catch (err) {
      toast.error(isEdit ? t("updateError") : t("createError"), { description: em(err) })
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
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          {t("add")}
        </Button>
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
        <div className="space-y-3">
          <Input
            value={table.query}
            onChange={(e) => table.setQuery(e.target.value)}
            placeholder={tc("search")}
            className="max-w-sm"
          />
          <div className="overflow-hidden rounded-xl border bg-card shadow-card">
            <Table>
              <TableHeader>
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
                      <SortableHead sortKey="namePt" sort={table.sort} onToggle={table.toggleSort}>
                        {t("colNamePt")}
                      </SortableHead>
                      <SortableHead sortKey="nameEn" sort={table.sort} onToggle={table.toggleSort}>
                        {t("colNameEn")}
                      </SortableHead>
                    </>
                  )}
                  <TableHead className="w-32 text-right">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-sm text-muted-foreground"
                    >
                      {tc("noResults")}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.rows.map((r) => (
                <TableRow key={r.id}>
                  {isPathogen ? (
                    <>
                      <TableCell className="font-medium">{display(r)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {txt(locale, (r as PathogenRow).group.name)}
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-medium">{i18nPt((r as NamedRow).name)}</TableCell>
                      <TableCell>{i18nEn((r as NamedRow).name)}</TableCell>
                    </>
                  )}
                  <TableCell className="text-right">
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
                  </TableCell>
                </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? t("editTitle") : t("addTitle")}</DialogTitle>
            <DialogDescription>{isPathogen ? t("addDescPathogen") : t("addDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                        form.setValue("taxonFamily", m?.family ?? "")
                        form.setValue("taxonOrder", m?.order ?? "")
                      }}
                    />
                  )}
                />
                {form.formState.errors.sci && (
                  <p className="text-xs text-destructive">{form.formState.errors.sci.message}</p>
                )}
                {taxonId != null && (
                  <p className="text-xs text-muted-foreground">
                    {t("ncbiLinked", {
                      taxonId,
                      taxon:
                        [form.watch("taxonFamily"), form.watch("taxonOrder")]
                          .filter(Boolean)
                          .join(" · ") || "—",
                    })}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="namePt">{t("namePt")}</Label>
                  <Input id="namePt" {...form.register("namePt", { required: tval("required") })} />
                  {form.formState.errors.namePt && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.namePt.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nameEn">{t("nameEn")}</Label>
                  <Input id="nameEn" {...form.register("nameEn", { required: tval("required") })} />
                  {form.formState.errors.nameEn && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.nameEn.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                {tc("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
