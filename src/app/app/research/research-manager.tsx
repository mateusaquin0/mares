"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal, Plus, Search, Globe, Lock } from "lucide-react"

import { createResearchSchema, type CreateResearchData } from "@/schemas/research.schema"
import {
  useResearchList,
  useCreateResearch,
  useUpdateResearch,
  useDeleteResearch,
} from "@/hooks/use-research"
import type { ResearchListItem } from "@/types/research"
import { useErrorMessage } from "@/lib/use-error-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ReloadButton } from "@/components/ui/reload-button"
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

export function ResearchManager({ isOrgAdmin, selfId }: { isOrgAdmin: boolean; selfId: string }) {
  const t = useTranslations("research")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const em = useErrorMessage()
  const researchQ = useResearchList()
  const items = researchQ.data ?? []
  const loading = researchQ.isLoading
  const [query, setQuery] = useState("")
  const filtered = items.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ResearchListItem | null>(null)
  const [confirm, setConfirm] = useState<ResearchListItem | null>(null)

  const createM = useCreateResearch()
  const updateM = useUpdateResearch(editing?.id ?? "")
  const deleteM = useDeleteResearch()

  const form = useForm<CreateResearchData>({
    resolver: zodResolver(createResearchSchema),
    defaultValues: { name: "", description: "", isPublic: false },
  })

  function openCreate() {
    setEditing(null)
    form.reset({ name: "", description: "", isPublic: false })
    setOpen(true)
  }

  function openEdit(r: ResearchListItem) {
    setEditing(r)
    form.reset({ name: r.name, description: r.description ?? "", isPublic: r.isPublic })
    setOpen(true)
  }

  async function onSubmit(data: CreateResearchData) {
    try {
      if (editing) await updateM.mutateAsync(data)
      else await createM.mutateAsync(data)
      toast.success(editing ? t("edited") : t("created"))
      form.reset({ name: "", description: "", isPublic: false })
      setOpen(false)
      setEditing(null)
    } catch (err) {
      toast.error(editing ? t("editError") : t("createError"), { description: em(err) })
    }
  }

  async function remove(r: ResearchListItem) {
    try {
      await deleteM.mutateAsync(r.id)
      toast.success(t("deleted"))
    } catch (err) {
      toast.error(t("deleteError"), { description: em(err) })
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          {t("new")}
        </Button>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <div className="border-b p-4">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="pl-9"
              />
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colVisibility")}</TableHead>
                <TableHead className="text-right">{t("colProtocols")}</TableHead>
                <TableHead className="text-right">{t("colAnimals")}</TableHead>
                <TableHead className="w-24 text-right">
                  <ReloadButton />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableEmpty colSpan={5}>
                  {items.length === 0 ? t("empty") : tc("noResults")}
                </TableEmpty>
              )}
              {filtered.map((r) => (
                <TableRow
                  key={r.id}

                >
                  <TableCell className="font-medium">
                    <Link href={`/app/research/${r.id}`} className="hover:underline">
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {r.isPublic ? (
                      <Badge variant="public" className="gap-1">
                        <Globe className="size-3" />
                        {t("public")}
                      </Badge>
                    ) : (
                      <Badge variant="private" className="gap-1">
                        <Lock className="size-3" />
                        {t("private")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{r._count.protocols}</TableCell>
                  <TableCell className="text-right">{r._count.animals}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">{t("colActions")}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/research/${r.id}`}>{t("view")}</Link>
                        </DropdownMenuItem>
                        {(isOrgAdmin || r.createdById === selfId) && (
                          <DropdownMenuItem onSelect={() => openEdit(r)}>
                            {tc("edit")}
                          </DropdownMenuItem>
                        )}
                        {isOrgAdmin && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setConfirm(r)}
                          >
                            {tc("delete")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(o) => !o && setConfirm(null)}
          title={t("deleteTitle")}
          description={t("deleteDesc", { name: confirm.name })}
          confirmLabel={tc("delete")}
          destructive
          onConfirm={() => remove(confirm)}
        />
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setEditing(null)
        }}
      >
        <DialogContent dirty={form.formState.isDirty}>
          <DialogHeader>
            <DialogTitle>{editing ? t("editTitle") : t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">{t("nameLabel")}</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {tval(form.formState.errors.name.message!)}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="description">{t("descriptionLabel")}</Label>
              <Textarea id="description" rows={3} {...form.register("description")} />
            </div>
            {isOrgAdmin && (
              <div className="flex items-start gap-2">
                <Checkbox
                  id="isPublic"
                  checked={form.watch("isPublic")}
                  onCheckedChange={(v) => form.setValue("isPublic", v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="isPublic" className="text-sm font-normal text-muted-foreground">
                  {t("isPublicHint")}
                </Label>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false)
                  setEditing(null)
                }}
              >
                {tc("cancel")}
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                {editing ? tc("save") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
