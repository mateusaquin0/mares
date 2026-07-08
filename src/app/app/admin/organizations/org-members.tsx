"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { UserPlus, Trash2 } from "lucide-react"

import { addMemberSchema, type AddMemberData } from "@/schemas/organization.schema"
import { useAddOrgMember, useSetOrgMemberRole, useRemoveOrgMember } from "@/hooks/use-admin"
import type { AdminOrg } from "@/types/admin"
import type { OrgMemberRole } from "@/types/organization"
import { useErrorMessage } from "@/lib/use-error-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/confirm-dialog"
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
import { ReloadButton } from "@/components/ui/reload-button"

// Gestão de membros de um grupo pelo admin global (adicionar, mudar papel, remover).
export function OrgMembers({ org }: { org: AdminOrg }) {
  const t = useTranslations("adminOrgs")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const em = useErrorMessage()

  const addM = useAddOrgMember(org.id)
  const roleM = useSetOrgMemberRole(org.id)
  const removeM = useRemoveOrgMember(org.id)
  const [removing, setRemoving] = useState<string | null>(null)

  const form = useForm<AddMemberData>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { email: "", name: "", role: "RESEARCHER" },
  })

  async function onAdd(data: AddMemberData) {
    try {
      const res = await addM.mutateAsync({ ...data, name: data.name?.trim() || undefined })
      toast.success(res.invited ? t("memberInvited") : t("memberAdded"))
      form.reset({ email: "", name: "", role: "RESEARCHER" })
    } catch (err) {
      toast.error(t("addError"), { description: em(err) })
    }
  }

  async function changeRole(userId: string, role: OrgMemberRole) {
    try {
      await roleM.mutateAsync({ userId, role })
      toast.success(t("roleChanged"))
    } catch (err) {
      toast.error(t("roleError"), { description: em(err) })
    }
  }

  async function remove(userId: string) {
    setRemoving(userId)
    try {
      const res = await removeM.mutateAsync(userId)
      toast.success(res.orgDeactivated ? t("orgDeactivatedToast") : t("memberRemoved"))
    } catch (err) {
      toast.error(t("removeError"), { description: em(err) })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">{t("membersSection")}</p>
        {org.members.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{t("noMembers")}</p>
        ) : (
          <div className="mt-2 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colUserName")}</TableHead>
                  <TableHead className="w-40">{t("colUserRole")}</TableHead>
                  <TableHead className="w-12 text-right">
                    <ReloadButton />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {org.members.map((m) => (
                  <TableRow key={m.userId}>
                    <TableCell>
                      <div className="font-medium">{m.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={m.role}
                        onValueChange={(v) => changeRole(m.userId, v as OrgMemberRole)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ORG_ADMIN">{tc("roleAdmin")}</SelectItem>
                          <SelectItem value="RESEARCHER">{tc("roleResearcher")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <ConfirmDialog
                        title={t("removeMemberTitle")}
                        description={t("removeMemberDesc", { email: m.email })}
                        confirmLabel={tc("remove")}
                        destructive
                        onConfirm={() => remove(m.userId)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            disabled={removing === m.userId}
                          >
                            <Trash2 className="size-4" />
                            <span className="sr-only">{tc("remove")}</span>
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Adicionar membro */}
      <form onSubmit={form.handleSubmit(onAdd)} className="space-y-3 rounded-md border p-3">
        <p className="text-sm font-medium">{t("addMemberTitle")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="add-email">{t("addEmailLabel")}</Label>
            <Input id="add-email" type="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">
                {tval(form.formState.errors.email.message!)}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-name">{t("addNameLabel")}</Label>
            <Input id="add-name" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">
                {tval(form.formState.errors.name.message!)}
              </p>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("addNameHint")}</p>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label>{t("colUserRole")}</Label>
            <Select
              value={form.watch("role") ?? "RESEARCHER"}
              onValueChange={(v) => form.setValue("role", v as OrgMemberRole)}
            >
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ORG_ADMIN">{tc("roleAdmin")}</SelectItem>
                <SelectItem value="RESEARCHER">{tc("roleResearcher")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" loading={form.formState.isSubmitting}>
            <UserPlus className="size-4" />
            {t("addMemberButton")}
          </Button>
        </div>
      </form>

      {org.deactivatedAt && (
        <Badge variant="secondary" className="gap-1">
          {t("deactivatedBadge")}
        </Badge>
      )}
    </div>
  )
}
