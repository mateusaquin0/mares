"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus } from "lucide-react"

import {
  catalogCreateSchema,
  type CatalogCreateData,
  type CatalogType,
} from "@/schemas/catalog.schema"
import { useErrorMessage } from "@/lib/use-error-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

type CatalogRow = {
  id: string
  key: string
  namePt: string
  nameEn: string
  groupPt: string | null
  groupEn: string | null
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} ${res.status}`)
  return res.json()
}

export function CatalogManager({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations("catalogs")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const em = useErrorMessage()
  const qc = useQueryClient()

  const [type, setType] = useState<CatalogType>("organs")
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; row?: CatalogRow } | null>(null)
  const hasGroup = type === "pathogens"

  const listQ = useQuery({
    queryKey: ["catalog", type],
    queryFn: () => getJson<CatalogRow[]>(`/api/catalog/${type}`),
    staleTime: 60_000,
  })

  const form = useForm<CatalogCreateData>({
    resolver: zodResolver(catalogCreateSchema),
    defaultValues: { namePt: "", nameEn: "", groupPt: "", groupEn: "" },
  })

  function openCreate() {
    form.reset({ namePt: "", nameEn: "", groupPt: "", groupEn: "" })
    setDialog({ mode: "create" })
  }
  function openEdit(row: CatalogRow) {
    form.reset({
      namePt: row.namePt,
      nameEn: row.nameEn,
      groupPt: row.groupPt ?? "",
      groupEn: row.groupEn ?? "",
    })
    setDialog({ mode: "edit", row })
  }

  async function onSubmit(data: CatalogCreateData) {
    const isEdit = dialog?.mode === "edit"
    const url = isEdit ? `/api/catalog/${type}/${dialog!.row!.id}` : `/api/catalog/${type}`
    const res = await fetch(url, {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      toast.error(isEdit ? t("updateError") : t("createError"), {
        description: em(await res.json().catch(() => ({}))),
      })
      return
    }
    toast.success(isEdit ? t("updated") : t("created"))
    setDialog(null)
    qc.invalidateQueries({ queryKey: ["catalog", type] })
  }

  async function remove(row: CatalogRow) {
    const res = await fetch(`/api/catalog/${type}/${row.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error(t("deleteError"), { description: em(await res.json().catch(() => ({}))) })
      return
    }
    toast.success(t("deleted"))
    qc.invalidateQueries({ queryKey: ["catalog", type] })
  }

  const rows = listQ.data ?? []

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
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
        <p className="text-sm text-muted-foreground">{tc("loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colNamePt")}</TableHead>
                <TableHead>{t("colNameEn")}</TableHead>
                {hasGroup && <TableHead>{t("colGroupPt")}</TableHead>}
                {hasGroup && <TableHead>{t("colGroupEn")}</TableHead>}
                {canEdit && <TableHead className="w-32 text-right">{tc("actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.namePt}</TableCell>
                  <TableCell>{r.nameEn}</TableCell>
                  {hasGroup && (
                    <TableCell className="text-muted-foreground">{r.groupPt ?? "—"}</TableCell>
                  )}
                  {hasGroup && (
                    <TableCell className="text-muted-foreground">{r.groupEn ?? "—"}</TableCell>
                  )}
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                          {tc("edit")}
                        </Button>
                        <ConfirmDialog
                          title={t("deleteTitle")}
                          description={t("deleteDesc", { name: r.namePt })}
                          confirmLabel={tc("delete")}
                          destructive
                          onConfirm={() => remove(r)}
                          trigger={
                            <Button variant="outline" size="sm">
                              {tc("delete")}
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? t("editTitle") : t("addTitle")}</DialogTitle>
            <DialogDescription>{t("addDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="namePt">{t("namePt")}</Label>
                <Input id="namePt" {...form.register("namePt")} />
                {form.formState.errors.namePt && (
                  <p className="text-xs text-destructive">
                    {tval(form.formState.errors.namePt.message!)}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="nameEn">{t("nameEn")}</Label>
                <Input id="nameEn" {...form.register("nameEn")} />
                {form.formState.errors.nameEn && (
                  <p className="text-xs text-destructive">
                    {tval(form.formState.errors.nameEn.message!)}
                  </p>
                )}
              </div>
            </div>
            {hasGroup && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="groupPt">{t("groupPt")}</Label>
                  <Input id="groupPt" {...form.register("groupPt")} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="groupEn">{t("groupEn")}</Label>
                  <Input id="groupEn" {...form.register("groupEn")} />
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
