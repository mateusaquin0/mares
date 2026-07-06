"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { ArrowLeft, Download, Pencil, Plus, Trash2 } from "lucide-react"

import { updateResearchSchema, type UpdateResearchData } from "@/schemas/research.schema"
import {
  useResearch,
  useUpdateResearch,
  useAddProtocol,
  useRemoveProtocol,
} from "@/hooks/use-research"
import { useOrgans, usePathogens, useExamTypes } from "@/hooks/use-catalog"
import type { CatalogItem } from "@/types/catalog"
import { txt, pathogenName } from "@/lib/catalog-i18n"
import { useErrorMessage } from "@/lib/use-error-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
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
  const tval = useTranslations("validation")
  const locale = useLocale()
  const em = useErrorMessage()

  const researchQ = useResearch(id)
  const organsQ = useOrgans(isOrgAdmin)
  const pathogensQ = usePathogens(isOrgAdmin)
  const examTypesQ = useExamTypes(isOrgAdmin)
  const updateM = useUpdateResearch(id)
  const addM = useAddProtocol(id)
  const removeM = useRemoveProtocol(id)

  const [organId, setOrganId] = useState<string>()
  const [pathogenId, setPathogenId] = useState<string>()
  const [examTypeId, setExamTypeId] = useState<string>()
  const [editOpen, setEditOpen] = useState(false)

  const research = researchQ.data
  const canEditContent = isOrgAdmin || (research?.createdById === selfId)

  const opts = (list: CatalogItem[] | undefined): ComboboxOption[] =>
    (list ?? []).map((c) => ({ value: c.id, label: txt(locale, c.name) }))

  const editForm = useForm<UpdateResearchData>({
    resolver: zodResolver(updateResearchSchema),
  })

  function openEdit() {
    if (!research) return
    editForm.reset({
      name: research.name,
      description: research.description ?? "",
      isPublic: research.isPublic,
    })
    setEditOpen(true)
  }

  async function onEdit(data: UpdateResearchData) {
    try {
      await updateM.mutateAsync(data)
      toast.success(t("edited"))
      setEditOpen(false)
    } catch (err) {
      toast.error(t("editError"), { description: em(err) })
    }
  }

  async function addEntry() {
    if (!organId || !pathogenId || !examTypeId) return
    try {
      await addM.mutateAsync([{ organId, pathogenId, examTypeId }])
      toast.success(tp("added"))
      setOrganId(undefined)
      setPathogenId(undefined)
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
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{research.name}</h1>
            <Badge variant={research.isPublic ? "public" : "private"}>
              {research.isPublic ? t("public") : t("private")}
            </Badge>
          </div>
          {research.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {research.description}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {t("animalsCount", { count: research._count.animals })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {research._count.animals > 0 && (
            <Button asChild variant="outline">
              <a href={`/api/research/${id}/export/darwin-core`}>
                <Download className="size-4" />
                {t("export")}
              </a>
            </Button>
          )}
          {canEditContent && (
            <Button variant="outline" onClick={openEdit}>
              <Pencil className="size-4" />
              {tc("edit")}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{tp("title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{tp("subtitle")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {isOrgAdmin && (
          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Combobox
              options={opts(organsQ.data)}
              value={organId}
              onChange={setOrganId}
              placeholder={tp("organ")}
              searchPlaceholder={tc("loading")}
              emptyText={tc("loading")}
              loading={organsQ.isLoading}
            />
            <Combobox
              options={(pathogensQ.data ?? []).map((c) => ({
                value: c.id,
                label: pathogenName(locale, c),
              }))}
              value={pathogenId}
              onChange={setPathogenId}
              placeholder={tp("pathogen")}
              searchPlaceholder={tc("loading")}
              emptyText={tc("loading")}
              loading={pathogensQ.isLoading}
            />
            <Combobox
              options={opts(examTypesQ.data)}
              value={examTypeId}
              onChange={setExamTypeId}
              placeholder={tp("examType")}
              searchPlaceholder={tc("loading")}
              emptyText={tc("loading")}
              loading={examTypesQ.isLoading}
            />
            <Button
              onClick={addEntry}
              disabled={!organId || !pathogenId || !examTypeId}
              loading={addM.isPending}
            >
              <Plus className="size-4" />
              {tc("add")}
            </Button>
          </div>
        )}

          {research.protocols.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tp("empty")}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tp("organ")}</TableHead>
                  <TableHead>{tp("pathogen")}</TableHead>
                  <TableHead>{tp("examType")}</TableHead>
                  {isOrgAdmin && <TableHead className="w-16 text-right">{tc("actions")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {research.protocols.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{txt(locale, p.organ.name)}</TableCell>
                    <TableCell>{pathogenName(locale, p.pathogen)}</TableCell>
                    <TableCell>{txt(locale, p.examType.name)}</TableCell>
                    {isOrgAdmin && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive"
                          onClick={() => removeEntry(p.id)}
                          aria-label={tc("remove")}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
            <DialogDescription>{t("createDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="ename">{t("nameLabel")}</Label>
              <Input id="ename" {...editForm.register("name")} />
              {editForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {tval(editForm.formState.errors.name.message!)}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="edesc">{t("descriptionLabel")}</Label>
              <Textarea id="edesc" rows={3} {...editForm.register("description")} />
            </div>
            {isOrgAdmin && (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="eisPublic"
                  checked={editForm.watch("isPublic")}
                  onCheckedChange={(v) => editForm.setValue("isPublic", v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="eisPublic" className="text-sm font-normal text-muted-foreground">
                  {t("isPublicHint")}
                </Label>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" loading={editForm.formState.isSubmitting}>
                {tc("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
