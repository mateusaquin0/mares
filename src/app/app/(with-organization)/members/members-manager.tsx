"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, MoreHorizontal, Pencil, Search, ShieldCheck, User, UserPlus } from "lucide-react"

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
  useResendInvite,
} from "@/hooks/use-members"
import { useLookupUser } from "@/hooks/use-users"
import type { Member } from "@/types/organization"
import { LIMITS } from "@/schemas/limits"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputActionButton, InputWithAction } from "@/components/ui/input-action"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { TableSkeleton } from "@/components/ui/skeleton"
import { DataRow, SectionTitle } from "@/components/ui/section"
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
import { EmptyState } from "@/components/ui/empty-state"

type OrgData = z.infer<typeof updateOrganizationSchema>

type Confirm = { kind: "remove" | "leave" | "demote" | "promote"; member: Member }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  const resendM = useResendInvite(orgId)
  const lookupM = useLookupUser()
  const orgQ = useOrganization(orgId, editOpen)
  // Resultado da busca por e-mail (lupa): null = ainda não buscou; found = já existe na
  // plataforma (nome preenchido e travado); notFound = novo usuário (exige nome).
  const [lookup, setLookup] = useState<{ found: boolean } | null>(null)

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

  function openAdd() {
    setLookup(null)
    addForm.reset({ email: "", name: "", role: "RESEARCHER" })
    setAddOpen(true)
  }

  // Lupa: busca o e-mail na plataforma. Se existir, preenche o nome e trava o campo
  // (reaproveita a conta); senão, libera o nome para convidar um novo usuário.
  async function lookupEmail() {
    const email = addForm.getValues("email").trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
      addForm.setError("email", { message: "email" })
      return
    }
    try {
      const res = await lookupM.mutateAsync(email)
      setLookup({ found: res.exists })
      addForm.setValue("name", res.exists ? (res.name ?? "") : "", { shouldValidate: true })
    } catch (err) {
      toast.error(t("lookupError"), { description: em(err) })
    }
  }

  async function onAdd(data: AddMemberData) {
    try {
      const result = await addM.mutateAsync(data)
      toast.success(result.invited ? t("invitedToast") : t("addedToast"))
      addForm.reset({ email: "", name: "", role: "RESEARCHER" })
      setLookup(null)
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

  async function resend(m: Member) {
    setBusy(m.userId)
    try {
      await resendM.mutateAsync(m.userId)
      toast.success(t("resendSuccess"))
    } catch (err) {
      toast.error(t("resendError"), { description: em(err) })
    } finally {
      setBusy(null)
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

  const q = query.trim().toLowerCase()
  const filtered = members.filter(
    (m) => (m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
  )
  const adminCount = members.filter((m) => m.role === "ORG_ADMIN").length
  const pending = members.filter((m) => m.status === "INVITED")

  return (
    <div className="flex h-full min-h-[42rem] flex-col gap-4 px-page pb-8 pt-3.5">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div>
          <h1 className="font-serif text-[28px] font-medium leading-8">{t("title")}</h1>
          <p className="mt-0.5 max-w-[820px] text-pretty text-muted-foreground">{orgName}</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={openEdit}>
              <Pencil className="size-4" />
              {t("editOrg")}
            </Button>
            <Button onClick={openAdd}>
              <UserPlus className="size-4" />
              {t("addMember")}
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <TableSkeleton />
      ) : members.length === 0 ? (
        <EmptyState className="border-t-2" title={t("empty")} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-wrap gap-x-10 gap-y-5">
          <section className="flex min-h-0 min-w-0 flex-[1_1_600px] flex-col">
            <div className="pb-2.5">
              <div className="relative w-[320px] max-w-full">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 [&>div]:h-full">
              <Table className="table-fixed">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>{t("colName")}</TableHead>
                    <TableHead className="w-[38%]">{tc("email")}</TableHead>
                    <TableHead className="w-[150px]">{t("colRole")}</TableHead>
                    <TableHead className="w-12 text-right">
                      <ReloadButton />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && <TableEmpty colSpan={4}>{tc("noResults")}</TableEmpty>}
                  {filtered.map((m) => {
                    const isSelf = m.userId === selfId
                    const isAdmin = m.role === "ORG_ADMIN"
                    const RoleIcon = isAdmin ? ShieldCheck : User
                    return (
                      <TableRow key={m.userId} className="hover:bg-transparent">
                        <TableCell className="font-semibold">
                          <span className="flex min-w-0 items-center gap-2">
                            <Truncate className="max-w-full">{m.name ?? "—"}</Truncate>
                            {m.status === "INVITED" && (
                              <Badge variant="outline" className="h-[18px] px-1.5 text-xs">
                                {tc("invited")}
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <Truncate className="max-w-full">{m.email}</Truncate>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5">
                            <RoleIcon className="size-4 shrink-0 text-muted-foreground" />
                            {isAdmin ? tc("roleAdmin") : tc("roleResearcher")}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground"
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
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </section>

          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
            <section>
              <SectionTitle>{t("summaryTitle")}</SectionTitle>
              <dl>
                <DataRow label={t("summaryTotal")} labelWidth="minmax(0,1fr)">
                  <b className="block text-right font-semibold">{members.length}</b>
                </DataRow>
                <DataRow label={t("summaryAdmins")} labelWidth="minmax(0,1fr)">
                  <b className="block text-right font-semibold">{adminCount}</b>
                </DataRow>
                <DataRow label={t("summaryResearchers")} labelWidth="minmax(0,1fr)">
                  <b className="block text-right font-semibold">{members.length - adminCount}</b>
                </DataRow>
              </dl>
            </section>

            <section>
              <SectionTitle>{t("pendingTitle")}</SectionTitle>
              {pending.length === 0 ? (
                <EmptyState bordered={false} className="py-1.5" title={t("pendingEmpty")} />
              ) : (
                <ul>
                  {pending.map((m) => (
                    <li
                      key={m.userId}
                      className="flex items-center gap-2.5 border-b border-border py-1.5"
                    >
                      <span className="min-w-0 flex-1">
                        <b className="block truncate font-semibold">{m.email}</b>
                        <span className="block text-[13px] text-muted-foreground">
                          {t("pendingLabel")}
                        </span>
                      </span>
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-[26px] shrink-0"
                          loading={busy === m.userId}
                          onClick={() => resend(m)}
                          title={t("resendInvite")}
                        >
                          {t("resend")}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
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

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dirty={addForm.formState.isDirty}>
          <DialogHeader>
            <DialogTitle>{t("addMember")}</DialogTitle>
            <DialogDescription>{t("addMemberDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={addForm.handleSubmit(onAdd)} className="space-y-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="email" required>
                {t("emailLabel")}
              </Label>
              <InputWithAction
                action={
                  <InputActionButton
                    onClick={lookupEmail}
                    loading={lookupM.isPending}
                    title={t("lookupTitle")}
                  >
                    {!lookupM.isPending && <Search />}
                  </InputActionButton>
                }
              >
                {(() => {
                  const emailReg = addForm.register("email")
                  return (
                    <Input
                      id="email"
                      type="email"
                      maxLength={LIMITS.name}
                      placeholder={t("emailPlaceholder")}
                      {...emailReg}
                      onChange={(e) => {
                        emailReg.onChange(e)
                        // Editar o e-mail invalida a busca anterior.
                        if (lookup) setLookup(null)
                      }}
                    />
                  )
                })()}
              </InputWithAction>
              {addForm.formState.errors.email && (
                <p className="text-xs text-destructive">
                  {tval(addForm.formState.errors.email.message!)}
                </p>
              )}
              {lookup?.found && (
                <p className="flex items-center gap-1 text-[13px] font-semibold text-positive">
                  <Check className="size-3.5 shrink-0" aria-hidden />
                  {t("lookupFound")}
                </p>
              )}
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="name">{t("nameLabel")}</Label>
              <Input
                id="name"
                maxLength={LIMITS.name}
                readOnly={lookup?.found}
                {...addForm.register("name")}
              />
              {lookup == null ? (
                <p className="text-xs text-muted-foreground">{t("nameLookupHint")}</p>
              ) : (
                !lookup.found && (
                  <p className="text-xs text-muted-foreground">{t("nameNewUserHint")}</p>
                )
              )}
              {addForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {tval(addForm.formState.errors.name.message!)}
                </p>
              )}
            </div>
            <div className="space-y-0.5">
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent dirty={editForm.formState.isDirty}>
          <DialogHeader>
            <DialogTitle>{t("editOrg")}</DialogTitle>
            <DialogDescription>{t("editOrgDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditOrg)} className="space-y-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="orgName" required>
                {t("orgName")}
              </Label>
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
