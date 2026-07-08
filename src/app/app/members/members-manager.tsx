"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal, Pencil, UserPlus, Search, Users, Mail } from "lucide-react"

import {
  addMemberSchema,
  type AddMemberData,
  updateOrganizationSchema,
} from "@/schemas/organization.schema"
import type { z } from "zod"
import {
  useMembers,
  useOrganization,
  useAddMember,
  useUpdateOrganization,
  useSetMemberRole,
  useRemoveMember,
} from "@/hooks/use-members"
import type { Member } from "@/types/organization"
import { LIMITS } from "@/schemas/limits"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { TableSkeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { LocationPicker } from "@/components/location-picker"
import { useErrorMessage } from "@/lib/use-error-message"
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

type OrgData = z.infer<typeof updateOrganizationSchema>

type Confirm = { kind: "remove" | "leave" | "demote" | "promote"; member: Member }

export function MembersManager({
  orgId,
  orgName,
  selfId,
  canManage,
}: {
  orgId: string
  orgName: string
  selfId: string
  // Admin da org gerencia; pesquisador vê a lista em modo leitura.
  canManage: boolean
}) {
  const router = useRouter()
  const t = useTranslations("members")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const em = useErrorMessage()
  const membersQ = useMembers(orgId)
  const members = membersQ.data ?? []
  const loading = membersQ.isLoading
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const addM = useAddMember(orgId)
  const updateOrgM = useUpdateOrganization(orgId)
  const roleM = useSetMemberRole(orgId)
  const removeM = useRemoveMember(orgId)
  const orgQ = useOrganization(orgId, editOpen)

  const addForm = useForm<AddMemberData>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { email: "", name: "", role: "RESEARCHER" },
  })
  const editForm = useForm<OrgData>({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: { name: orgName, city: "", state: "", country: "" },
  })

  // Semeia o formulário de edição quando o detalhe da organização chega.
  useEffect(() => {
    if (editOpen && orgQ.data) {
      editForm.reset({
        name: orgQ.data.name ?? "",
        city: orgQ.data.city ?? "",
        state: orgQ.data.state ?? "",
        country: orgQ.data.country ?? "",
      })
    }
  }, [editOpen, orgQ.data, editForm])

  async function onAdd(data: AddMemberData) {
    try {
      const result = await addM.mutateAsync(data)
      toast.success(result.invited ? t("invitedToast") : t("addedToast"))
      addForm.reset({ email: "", name: "", role: "RESEARCHER" })
      setAddOpen(false)
    } catch (err) {
      toast.error(t("addErrorTitle"), { description: em(err) })
    }
  }

  function openEdit() {
    setEditOpen(true)
  }

  async function onEditOrg(data: OrgData) {
    try {
      await updateOrgM.mutateAsync(data)
      toast.success(t("orgUpdated"))
      setEditOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(t("orgUpdateError"), { description: em(err) })
    }
  }

  async function changeRole(m: Member, role: Member["role"]) {
    setBusy(m.userId)
    try {
      await roleM.mutateAsync({ userId: m.userId, role })
    } catch (err) {
      toast.error(t("roleErrorTitle"), { description: em(err) })
      return
    } finally {
      setBusy(null)
    }
    // Ao se rebaixar a pesquisador, o usuário perde acesso à gestão de membros.
    if (m.userId === selfId && role === "RESEARCHER") {
      toast.success(t("selfDemoted"))
      router.push("/app/dashboard")
      router.refresh()
      return
    }
  }

  async function remove(m: Member) {
    const isSelf = m.userId === selfId
    setBusy(m.userId)
    let result: { orgDeactivated?: boolean }
    try {
      result = await removeM.mutateAsync(m.userId)
    } catch (err) {
      toast.error(isSelf ? t("leaveErrorTitle") : t("removeErrorTitle"), { description: em(err) })
      return
    } finally {
      setBusy(null)
    }
    if (isSelf) {
      toast.success(result?.orgDeactivated ? t("orgDeactivated") : t("leftOrg"))
      router.push("/app/dashboard")
      router.refresh()
      return
    }
    toast.success(t("memberRemoved"))
    membersQ.refetch()
  }

  function runConfirm() {
    if (!confirm) return Promise.resolve()
    if (confirm.kind === "demote") return changeRole(confirm.member, "RESEARCHER")
    if (confirm.kind === "promote") return changeRole(confirm.member, "ORG_ADMIN")
    return remove(confirm.member)
  }

  const confirmCopy = confirm
    ? {
        remove: {
          title: t("removeTitle"),
          description: t("removeDesc", { email: confirm.member.email }),
          confirmLabel: tc("remove"),
        },
        leave: {
          title: t("leaveTitle"),
          description: t("leaveDesc"),
          confirmLabel: tc("leave"),
        },
        demote: {
          title: t("demoteTitle"),
          description: t("demoteDesc"),
          confirmLabel: t("makeResearcher"),
        },
        promote: {
          title: t("promoteTitle"),
          description: t("promoteDesc", { email: confirm.member.email }),
          confirmLabel: t("makeAdmin"),
        },
      }[confirm.kind]
    : null

  const initials = (s: string) =>
    s
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase()
  const q = query.trim().toLowerCase()
  const filtered = members.filter(
    (m) => (m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
  )
  const adminCount = members.filter((m) => m.role === "ORG_ADMIN").length
  const pending = members.filter((m) => m.status === "INVITED")

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{orgName}</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={openEdit}>
              <Pencil className="size-4" />
              {t("editOrg")}
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus className="size-4" />
              {t("addMember")}
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <TableSkeleton />
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Tabela de membros (esquerda) */}
          <div className="overflow-hidden rounded-xl border bg-card shadow-card lg:col-span-2">
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
                  <TableHead>{t("colRole")}</TableHead>
                  {canManage && (
                    <TableHead className="w-16 text-right">
                      <ReloadButton />
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableEmpty colSpan={canManage ? 3 : 2}>{tc("noResults")}</TableEmpty>
                )}
                {filtered.map((m) => {
                  const isSelf = m.userId === selfId
                  const isAdmin = m.role === "ORG_ADMIN"
                  return (
                    <TableRow key={m.userId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                            {initials(m.name ?? m.email)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 font-medium">
                              <span className="truncate">{m.name ?? "—"}</span>
                              {m.status === "INVITED" && (
                                <Badge variant="secondary">{tc("invited")}</Badge>
                              )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Badge className="border-transparent bg-primary text-primary-foreground hover:bg-primary/90">
                            {tc("roleAdmin")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{tc("roleResearcher")}</Badge>
                        )}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                disabled={busy === m.userId}
                              >
                                <MoreHorizontal className="size-4" />
                                <span className="sr-only">{t("colActions")}</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {isSelf ? (
                                <>
                                  {isAdmin && (
                                    // Último admin não pode se rebaixar (grupo ficaria sem admin):
                                    // item desabilitado com dica; o backend também rejeita.
                                    <DropdownMenuItem
                                      disabled={adminCount <= 1}
                                      title={adminCount <= 1 ? t("lastAdminHint") : undefined}
                                      onSelect={() => setConfirm({ kind: "demote", member: m })}
                                    >
                                      {t("makeResearcher")}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => setConfirm({ kind: "leave", member: m })}
                                  >
                                    {tc("leave")}
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <>
                                  <DropdownMenuItem
                                    // Não é possível alterar o papel de outro admin (visível,
                                    // desabilitado). Promover pesquisador → admin passa por confirmação.
                                    disabled={isAdmin}
                                    onSelect={() => setConfirm({ kind: "promote", member: m })}
                                  >
                                    {isAdmin ? t("makeResearcher") : t("makeAdmin")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    // Não é possível remover outro admin.
                                    disabled={isAdmin}
                                    onSelect={() => setConfirm({ kind: "remove", member: m })}
                                  >
                                    {tc("remove")}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Coluna lateral: resumo + convites pendentes */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4 text-accent-foreground" />
                  {t("summaryTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("summaryTotal")}</span>
                  <span className="font-semibold">{members.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("summaryAdmins")}</span>
                  <span className="font-semibold">{adminCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("summaryResearchers")}</span>
                  <span className="font-semibold">{members.length - adminCount}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="size-4 text-accent-foreground" />
                  {t("pendingTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pending.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("pendingEmpty")}</p>
                ) : (
                  <ul className="space-y-3">
                    {pending.map((m) => (
                      <li key={m.userId} className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          {initials(m.name ?? m.email)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{m.email}</p>
                          <p className="text-xs text-muted-foreground">{t("pendingLabel")}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Confirmação (controlada) para remover / sair / rebaixar. */}
      {confirmCopy && (
        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(o) => !o && setConfirm(null)}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          destructive={confirm?.kind === "remove" || confirm?.kind === "leave"}
          onConfirm={runConfirm}
        />
      )}

      {/* Modal: adicionar membro */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dirty={addForm.formState.isDirty}>
          <DialogHeader>
            <DialogTitle>{t("addMember")}</DialogTitle>
            <DialogDescription>{t("addMemberDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={addForm.handleSubmit(onAdd)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">{t("emailLabel")}</Label>
              <Input
                id="email"
                type="email"
                maxLength={LIMITS.name}
                {...addForm.register("email")}
              />
              {addForm.formState.errors.email && (
                <p className="text-xs text-destructive">
                  {tval(addForm.formState.errors.email.message!)}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">{t("nameLabel")}</Label>
              <Input id="name" maxLength={LIMITS.name} {...addForm.register("name")} />
              {addForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {tval(addForm.formState.errors.name.message!)}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>{t("roleLabel")}</Label>
              <Select
                value={addForm.watch("role") ?? "RESEARCHER"}
                onValueChange={(v) => addForm.setValue("role", v as AddMemberData["role"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RESEARCHER">{tc("roleResearcher")}</SelectItem>
                  <SelectItem value="ORG_ADMIN">{tc("roleAdmin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" loading={addForm.formState.isSubmitting}>
                {tc("add")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: editar organização */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent dirty={editForm.formState.isDirty}>
          <DialogHeader>
            <DialogTitle>{t("editOrg")}</DialogTitle>
            <DialogDescription>{t("editOrgDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditOrg)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="orgName">{t("orgName")}</Label>
              <Input id="orgName" maxLength={LIMITS.name} {...editForm.register("name")} />
              {editForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {tval(editForm.formState.errors.name.message!)}
                </p>
              )}
            </div>
            <LocationPicker
              value={{
                country: editForm.watch("country") || undefined,
                state: editForm.watch("state") || undefined,
                city: editForm.watch("city") || undefined,
              }}
              onChange={(loc) => {
                editForm.setValue("country", loc.country ?? "")
                editForm.setValue("state", loc.state ?? "")
                editForm.setValue("city", loc.city ?? "")
              }}
            />
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
