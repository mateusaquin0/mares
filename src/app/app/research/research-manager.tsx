"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal, Plus } from "lucide-react"

import { createResearchSchema, type CreateResearchData } from "@/schemas/research.schema"
import { useErrorMessage } from "@/lib/use-error-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/confirm-dialog"
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

type Research = {
  id: string
  name: string
  description: string | null
  isPublic: boolean
  createdById: string | null
  createdAt: string
  _count: { animals: number; protocols: number }
}

export function ResearchManager({ isOrgAdmin, selfId }: { isOrgAdmin: boolean; selfId: string }) {
  const t = useTranslations("research")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const em = useErrorMessage()
  const [items, setItems] = useState<Research[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Research | null>(null)
  const [confirm, setConfirm] = useState<Research | null>(null)

  const form = useForm<CreateResearchData>({
    resolver: zodResolver(createResearchSchema),
    defaultValues: { name: "", description: "", isPublic: false },
  })

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/research")
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    setEditing(null)
    form.reset({ name: "", description: "", isPublic: false })
    setOpen(true)
  }

  function openEdit(r: Research) {
    setEditing(r)
    form.reset({ name: r.name, description: r.description ?? "", isPublic: r.isPublic })
    setOpen(true)
  }

  async function onSubmit(data: CreateResearchData) {
    const res = await fetch(editing ? `/api/research/${editing.id}` : "/api/research", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      toast.error(editing ? t("editError") : t("createError"), {
        description: em(await res.json().catch(() => ({}))),
      })
      return
    }
    toast.success(editing ? t("edited") : t("created"))
    form.reset({ name: "", description: "", isPublic: false })
    setOpen(false)
    setEditing(null)
    load()
  }

  async function remove(r: Research) {
    const res = await fetch(`/api/research/${r.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error(t("deleteError"), { description: em(await res.json().catch(() => ({}))) })
      return
    }
    toast.success(t("deleted"))
    setItems((prev) => prev.filter((x) => x.id !== r.id))
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          {t("new")}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{tc("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colVisibility")}</TableHead>
                <TableHead className="text-right">{t("colProtocols")}</TableHead>
                <TableHead className="text-right">{t("colAnimals")}</TableHead>
                <TableHead className="w-24 text-right">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <Link href={`/app/research/${r.id}`} className="hover:underline">
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.isPublic ? "default" : "secondary"}>
                      {r.isPublic ? t("public") : t("private")}
                    </Badge>
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
        <DialogContent>
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
