"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { MoreHorizontal, Pencil, UserPlus } from "lucide-react"

import {
  addMemberSchema,
  type AddMemberData,
  updateOrganizationSchema,
} from "@/schemas/organization.schema"
import type { z } from "zod"
import { organizationsService } from "@/services/organizations"
import type { Member } from "@/types/organization"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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

type OrgData = z.infer<typeof updateOrganizationSchema>

type Confirm = { kind: "remove" | "leave" | "demote" | "promote"; member: Member }

export function MembersManager({
  orgId,
  orgName,
  selfId,
}: {
  orgId: string
  orgName: string
  selfId: string
}) {
  const router = useRouter()
  const t = useTranslations("members")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const em = useErrorMessage()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const addForm = useForm<AddMemberData>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { email: "", name: "", role: "RESEARCHER" },
  })
  const editForm = useForm<OrgData>({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: { name: orgName, city: "", state: "", country: "" },
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setMembers(await organizationsService.getMembers(orgId))
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  async function onAdd(data: AddMemberData) {
    try {
      const result = await organizationsService.addMember(orgId, data)
      toast.success(result.invited ? t("invitedToast") : t("addedToast"))
      addForm.reset({ email: "", name: "", role: "RESEARCHER" })
      setAddOpen(false)
      load()
    } catch (err) {
      toast.error(t("addErrorTitle"), { description: em(err) })
    }
  }

  // Abre o modal de edição carregando os dados atuais da organização.
  async function openEdit() {
    setEditOpen(true)
    try {
      const o = await organizationsService.get(orgId)
      editForm.reset({
        name: o.name ?? "",
        city: o.city ?? "",
        state: o.state ?? "",
        country: o.country ?? "",
      })
    } catch {
      // silencioso
    }
  }

  async function onEditOrg(data: OrgData) {
    try {
      await organizationsService.update(orgId, data)
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
      await organizationsService.setMemberRole(orgId, m.userId, role)
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
    setMembers((prev) => prev.map((x) => (x.userId === m.userId ? { ...x, role } : x)))
  }

  async function remove(m: Member) {
    const isSelf = m.userId === selfId
    setBusy(m.userId)
    let result: { orgDeleted?: boolean }
    try {
      result = await organizationsService.removeMember(orgId, m.userId)
    } catch (err) {
      toast.error(isSelf ? t("leaveErrorTitle") : t("removeErrorTitle"), { description: em(err) })
      return
    } finally {
      setBusy(null)
    }
    if (isSelf) {
      toast.success(result?.orgDeleted ? t("orgDeleted") : t("leftOrg"))
      router.push("/app/dashboard")
      router.refresh()
      return
    }
    toast.success(t("memberRemoved"))
    setMembers((prev) => prev.filter((x) => x.userId !== m.userId))
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

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{orgName}</p>
        </div>
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
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{tc("loading")}</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colEmail")}</TableHead>
                <TableHead>{t("colRole")}</TableHead>
                <TableHead className="w-16 text-right">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const isSelf = m.userId === selfId
                const isAdmin = m.role === "ORG_ADMIN"
                return (
                  <TableRow key={m.userId}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {m.name ?? "—"}
                        {m.status === "INVITED" && (
                          <Badge variant="secondary">{tc("invited")}</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell>
                      <Badge variant={isAdmin ? "default" : "secondary"}>
                        {isAdmin ? tc("roleAdmin") : tc("roleResearcher")}
                      </Badge>
                    </TableCell>
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
                                <DropdownMenuItem
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
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addMember")}</DialogTitle>
            <DialogDescription>{t("addMemberDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={addForm.handleSubmit(onAdd)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">{t("emailLabel")}</Label>
              <Input id="email" type="email" {...addForm.register("email")} />
              {addForm.formState.errors.email && (
                <p className="text-xs text-destructive">
                  {tval(addForm.formState.errors.email.message!)}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">{t("nameLabel")}</Label>
              <Input id="name" {...addForm.register("name")} />
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
                onValueChange={(v) =>
                  addForm.setValue("role", v as AddMemberData["role"])
                }
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
              >
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editOrg")}</DialogTitle>
            <DialogDescription>{t("editOrgDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditOrg)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="orgName">{t("orgName")}</Label>
              <Input id="orgName" {...editForm.register("name")} />
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
              >
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
