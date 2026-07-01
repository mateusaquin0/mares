"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { useLocale, useTranslations } from "next-intl"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus } from "lucide-react"

import type { CatalogType } from "@/schemas/catalog.schema"
import { txt, type I18nText } from "@/lib/catalog-i18n"
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

type Row = {
  id: string
  key: string
  name: string | I18nText // string (patógeno) | { pt, en } (órgão/exame)
  group: I18nText | null
}

type FormShape = {
  namePt?: string
  nameEn?: string
  name?: string
  groupPt?: string
  groupEn?: string
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} ${res.status}`)
  return res.json()
}

const i18nPt = (v: string | I18nText) => (typeof v === "string" ? v : v.pt ?? "")
const i18nEn = (v: string | I18nText) => (typeof v === "string" ? v : v.en ?? "")

export function CatalogManager({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations("catalogs")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const locale = useLocale()
  const em = useErrorMessage()
  const qc = useQueryClient()

  const [type, setType] = useState<CatalogType>("organs")
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; row?: Row } | null>(null)
  const isPathogen = type === "pathogens"

  const listQ = useQuery({
    queryKey: ["catalog", type],
    queryFn: () => getJson<Row[]>(`/api/catalog/${type}`),
    staleTime: 60_000,
  })

  const form = useForm<FormShape>({
    defaultValues: { namePt: "", nameEn: "", name: "", groupPt: "", groupEn: "" },
  })

  function openCreate() {
    form.reset({ namePt: "", nameEn: "", name: "", groupPt: "", groupEn: "" })
    setDialog({ mode: "create" })
  }
  function openEdit(row: Row) {
    form.reset({
      namePt: i18nPt(row.name),
      nameEn: i18nEn(row.name),
      name: typeof row.name === "string" ? row.name : "",
      groupPt: row.group?.pt ?? "",
      groupEn: row.group?.en ?? "",
    })
    setDialog({ mode: "edit", row })
  }

  async function onSubmit(data: FormShape) {
    const isEdit = dialog?.mode === "edit"
    const url = isEdit ? `/api/catalog/${type}/${dialog!.row!.id}` : `/api/catalog/${type}`
    const body = isPathogen
      ? { name: data.name, groupPt: data.groupPt, groupEn: data.groupEn }
      : { namePt: data.namePt, nameEn: data.nameEn }
    const res = await fetch(url, {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  async function remove(row: Row) {
    const res = await fetch(`/api/catalog/${type}/${row.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error(t("deleteError"), { description: em(await res.json().catch(() => ({}))) })
      return
    }
    toast.success(t("deleted"))
    qc.invalidateQueries({ queryKey: ["catalog", type] })
  }

  // Ordena pela exibição no idioma ativo.
  const rows = [...(listQ.data ?? [])].sort((a, b) =>
    txt(locale, a.name).localeCompare(txt(locale, b.name), locale)
  )

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
                {isPathogen ? (
                  <>
                    <TableHead>{t("colName")}</TableHead>
                    <TableHead>{t("colGroupPt")}</TableHead>
                    <TableHead>{t("colGroupEn")}</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>{t("colNamePt")}</TableHead>
                    <TableHead>{t("colNameEn")}</TableHead>
                  </>
                )}
                {canEdit && <TableHead className="w-32 text-right">{tc("actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  {isPathogen ? (
                    <>
                      <TableCell className="font-medium">{i18nPt(r.name)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.group?.pt ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.group?.en ?? "—"}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-medium">{i18nPt(r.name)}</TableCell>
                      <TableCell>{i18nEn(r.name)}</TableCell>
                    </>
                  )}
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                          {tc("edit")}
                        </Button>
                        <ConfirmDialog
                          title={t("deleteTitle")}
                          description={t("deleteDesc", { name: i18nPt(r.name) })}
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
            <DialogDescription>{isPathogen ? t("addDescPathogen") : t("addDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {isPathogen ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="name">{t("nameSci")}</Label>
                  <Input id="name" {...form.register("name", { required: tval("required") })} />
                  {form.formState.errors.name && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>
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
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
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
