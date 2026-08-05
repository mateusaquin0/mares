"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal, Plus, Search, Globe, Lock, Clock, CircleAlert } from "lucide-react"

import { createResearchSchema, type CreateResearchData } from "@/schemas/research.schema"
import { LIMITS } from "@/schemas/limits"
import {
  useResearchCatalog,
  useCreateResearch,
  useUpdateResearch,
  useDeleteResearch,
  useRequestResearchAccess,
  useLeaveResearch,
} from "@/hooks/use-research"
import type { ResearchCatalogItem } from "@/types/research"
import { AccessRequestsDialog } from "./access-requests-dialog"
import { useErrorMessage } from "@/lib/use-error-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CharCounter } from "@/components/ui/char-counter"
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
import { Truncate } from "@/components/ui/truncate"
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

// Coluna "acesso" do catálogo: participa, pedido em andamento, ou botão para pedir.
// Um pedido recusado pode ser refeito — a decisão anterior fica registrada, mas não é uma
// punição permanente (a situação da pesquisa muda com o tempo).
function AccessCell({
  item,
  pending,
  onRequest,
}: {
  item: ResearchCatalogItem
  pending: boolean
  onRequest: () => void
}) {
  const t = useTranslations("research")

  if (item.isMember) return <Badge variant="secondary">{t("accessMember")}</Badge>
  // Admin da org sem vínculo: acessa (e edita) pelo PAPEL, não por participar da pesquisa.
  // O selo distingue isso de "Participa" e deixa claro que não há o que solicitar aqui.
  if (item.canSeeData) {
    return (
      <Badge variant="outline" className="text-muted-foreground" title={t("accessByRoleHint")}>
        {t("accessByRole")}
      </Badge>
    )
  }
  if (item.requestStatus === "PENDING") {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Clock className="size-3" />
        {t("accessPending")}
      </Badge>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" onClick={onRequest} disabled={pending}>
        {t("accessRequest")}
      </Button>
      {/* Recusa anterior: um ícone discreto explica por que o botão reaparece, sem poluir a
          célula com uma frase. O tooltip é o `title` nativo, padrão do resto das tabelas. */}
      {item.requestStatus === "REJECTED" && (
        <span role="img" aria-label={t("accessRejected")} title={t("accessRejected")}>
          <CircleAlert className="size-4 shrink-0 text-muted-foreground" />
        </span>
      )}
    </div>
  )
}

export function ResearchManager({ isOrgAdmin, selfId }: { isOrgAdmin: boolean; selfId: string }) {
  const t = useTranslations("research")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const em = useErrorMessage()
  const router = useRouter()
  // Catálogo: TODAS as pesquisas do grupo. Quem não é membro vê os metadados e pode pedir
  // acesso; os dados (animais, protocolos) continuam restritos. Ver docs/PERMISSOES.md.
  const researchQ = useResearchCatalog()
  const items = researchQ.data ?? []
  const loading = researchQ.isLoading
  const [query, setQuery] = useState("")
  const filtered = items.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ResearchCatalogItem | null>(null)
  const [confirm, setConfirm] = useState<ResearchCatalogItem | null>(null)
  const [leaving, setLeaving] = useState<ResearchCatalogItem | null>(null)

  const createM = useCreateResearch()
  const updateM = useUpdateResearch(editing?.id ?? "")
  const deleteM = useDeleteResearch()
  const requestM = useRequestResearchAccess()
  const leaveM = useLeaveResearch()

  const form = useForm<CreateResearchData>({
    resolver: zodResolver(createResearchSchema),
    defaultValues: { name: "", description: "", isPublic: false },
  })

  function openCreate() {
    setEditing(null)
    form.reset({ name: "", description: "", isPublic: false })
    setOpen(true)
  }

  function openEdit(r: ResearchCatalogItem) {
    setEditing(r)
    form.reset({ name: r.name, description: r.description ?? "", isPublic: r.isPublic })
    setOpen(true)
  }

  async function onSubmit(data: CreateResearchData) {
    try {
      if (editing) {
        await updateM.mutateAsync(data)
        toast.success(t("edited"))
        form.reset({ name: "", description: "", isPublic: false })
        setOpen(false)
        setEditing(null)
        return
      }
      // Nova pesquisa começa vazia: leva o usuário direto ao detalhe para montar o protocolo.
      const created = await createM.mutateAsync(data)
      toast.success(t("created"))
      router.push(`/app/research/${created.id}`)
    } catch (err) {
      toast.error(editing ? t("editError") : t("createError"), { description: em(err) })
    }
  }

  async function remove(r: ResearchCatalogItem) {
    try {
      await deleteM.mutateAsync(r.id)
      toast.success(t("deleted"))
    } catch (err) {
      toast.error(t("deleteError"), { description: em(err) })
    }
  }

  // Sair da pesquisa: some do escopo (dados deixam de aparecer), mas nada é apagado — as
  // amostras/análises lançadas pertencem à pesquisa. Dá para pedir acesso de novo depois.
  //
  // Para o admin do grupo é outra coisa: ele enxerga as pesquisas por PAPEL, não por vínculo,
  // então sair só o tira da lista de membros — o acesso continua. A mensagem reflete isso.
  async function leave(r: ResearchCatalogItem) {
    try {
      await leaveM.mutateAsync({ researchId: r.id, userId: selfId })
      toast.success(isOrgAdmin ? t("leftResearchAdmin") : t("leftResearch"), {
        description: isOrgAdmin ? t("leftResearchAdminDesc") : t("leftResearchDesc"),
      })
    } catch (err) {
      toast.error(t("leaveError"), { description: em(err) })
    }
  }

  async function requestAccess(r: ResearchCatalogItem) {
    try {
      await requestM.mutateAsync({ researchId: r.id })
      toast.success(t("accessRequested"), { description: t("accessRequestedDesc") })
    } catch (err) {
      toast.error(t("accessRequestError"), { description: em(err) })
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Fila de pedidos de acesso — só aparece para quem tem o que responder. */}
          <AccessRequestsDialog />
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            {t("new")}
          </Button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-card">
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
          {/* Rolagem contida na tabela (o <div overflow-auto> interno recebe h-full). */}
          <div className="min-h-0 flex-1 [&>div]:h-full">
            <Table>
              <TableHeader className="sticky top-0 z-10 [&_th]:bg-accent">
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colVisibility")}</TableHead>
                  <TableHead>{t("colAccess")}</TableHead>
                  <TableHead className="text-right">{t("colProtocols")}</TableHead>
                  <TableHead className="text-right">{t("colAnimals")}</TableHead>
                  <TableHead className="w-24 text-right">
                    <ReloadButton />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableEmpty colSpan={6}>
                    {items.length === 0 ? t("empty") : tc("noResults")}
                  </TableEmpty>
                )}
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    // Sem acesso aos dados não há detalhe a abrir: a linha é só a vitrine.
                    onClick={r.canSeeData ? () => router.push(`/app/research/${r.id}`) : undefined}
                    className={
                      r.canSeeData
                        ? "cursor-pointer transition-colors hover:bg-muted/50"
                        : undefined
                    }
                  >
                    <TableCell className="font-medium">
                      <Truncate className="max-w-[24rem]">{r.name}</Truncate>
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
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <AccessCell
                        item={r}
                        pending={requestM.isPending}
                        onRequest={() => requestAccess(r)}
                      />
                    </TableCell>
                    {/* Volume de dados só para quem participa (o catálogo expõe metadados). */}
                    <TableCell className="text-right">{r._count?.protocols ?? "—"}</TableCell>
                    <TableCell className="text-right">{r._count?.animals ?? "—"}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {/* O menu aparece para quem gere a pesquisa E para quem só participa
                          (a ação de sair do vínculo). */}
                      {(isOrgAdmin || r.createdById === selfId || r.isMember) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">{t("colActions")}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(isOrgAdmin || r.createdById === selfId) && (
                              <DropdownMenuItem onSelect={() => openEdit(r)}>
                                {tc("edit")}
                              </DropdownMenuItem>
                            )}
                            {r.isMember && (
                              <DropdownMenuItem onSelect={() => setLeaving(r)}>
                                {t("leave")}
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
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {leaving && (
        <ConfirmDialog
          open={!!leaving}
          onOpenChange={(o) => !o && setLeaving(null)}
          title={t("leaveTitle")}
          description={t(isOrgAdmin ? "leaveDescAdmin" : "leaveDesc", { name: leaving.name })}
          confirmLabel={t("leave")}
          destructive
          onConfirm={() => leave(leaving)}
        />
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
              <Input id="name" maxLength={LIMITS.name} {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {tval(form.formState.errors.name.message!)}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">{t("descriptionLabel")}</Label>
                <CharCounter value={form.watch("description")} max={LIMITS.longText} />
              </div>
              <Textarea
                id="description"
                rows={3}
                maxLength={LIMITS.longText}
                {...form.register("description")}
              />
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
