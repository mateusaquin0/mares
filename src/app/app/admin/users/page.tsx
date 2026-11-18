"use client"

import { useState, useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, Mail, Search, UserX, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useErrorMessage } from "@/lib/use-error-message"
import { useTable } from "@/lib/use-table"
import { useAdminUsers, useRemoveUser, useResendUserInvite } from "@/hooks/use-admin"
import type { AdminUser } from "@/types/admin"
import type { BadgeProps } from "@/components/ui/badge"
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
import { SortableHead } from "@/components/ui/sortable-head"

// Remoção solicitada é o único status que pede ação do admin (atender o pedido de exclusão).
const STATUS_META: Record<string, { variant: BadgeProps["variant"]; icon: LucideIcon }> = {
  ACTIVE: { variant: "positive", icon: Check },
  INVITED: { variant: "info", icon: Mail },
  DELETION_REQUESTED: { variant: "destructive", icon: UserX },
}

export default function AdminUsersPage() {
  const t = useTranslations("adminUsers")
  const tc = useTranslations("common")
  const locale = useLocale()
  const em = useErrorMessage()
  const usersQ = useAdminUsers()
  const users = usersQ.data ?? []
  const loading = usersQ.isLoading
  const removeM = useRemoveUser()
  const resendM = useResendUserInvite()
  const [busy, setBusy] = useState<string | null>(null)
  const [resending, setResending] = useState<string | null>(null)

  const statusLabel = useCallback(
    (s: string) =>
      ({
        INVITED: t("statusInvited"),
        ACTIVE: t("statusActive"),
        DELETION_REQUESTED: t("statusDeletionRequested"),
      })[s] ?? s,
    [t],
  )

  const orgsText = useCallback(
    (u: AdminUser) =>
      u.memberships.length === 0
        ? t("noOrg")
        : u.memberships
            .map(
              (m) =>
                `${m.orgName} (${m.role === "ORG_ADMIN" ? tc("roleAdmin") : tc("roleResearcher")})`,
            )
            .join(" · "),
    [t, tc],
  )

  const table = useTable(users, {
    locale,
    initialSort: { key: "name" },
    columns: {
      name: (u) => u.name ?? "",
      email: (u) => u.email,
      orgs: (u) => orgsText(u),
      status: (u) => statusLabel(u.status),
    },
    search: (u) => [u.name ?? "", u.email, orgsText(u), statusLabel(u.status)].join(" "),
  })

  async function remove(u: AdminUser) {
    setBusy(u.id)
    try {
      await removeM.mutateAsync(u.id)
      toast.success(t("deleted"))
    } catch (err) {
      toast.error(t("deleteError"), { description: em(err) })
    } finally {
      setBusy(null)
    }
  }

  async function resend(u: AdminUser) {
    setResending(u.id)
    try {
      await resendM.mutateAsync(u.id)
      toast.success(t("resendSuccess"))
    } catch (err) {
      toast.error(t("resendError"), { description: em(err) })
    } finally {
      setResending(null)
    }
  }

  return (
    <div className="px-page pb-8 pt-3.5">
      <div>
        <h1 className="font-serif text-[28px] font-medium leading-8">{t("title")}</h1>
        <p className="mt-0.5 max-w-[820px] text-pretty text-muted-foreground">{t("subtitle")}</p>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 py-2.5">
            <div className="relative min-w-0 flex-[0_1_320px]">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={table.query}
                onChange={(e) => table.setQuery(e.target.value)}
                placeholder={tc("search")}
                className="pl-8"
              />
            </div>
            <span className="text-muted-foreground">
              {t("count", { count: table.rows.length })}
            </span>
          </div>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <SortableHead
                  sortKey="name"
                  sort={table.sort}
                  onToggle={table.toggleSort}
                  className="w-[20%]"
                >
                  {t("colName")}
                </SortableHead>
                <SortableHead
                  sortKey="email"
                  sort={table.sort}
                  onToggle={table.toggleSort}
                  className="w-[23%]"
                >
                  {t("colEmail")}
                </SortableHead>
                <SortableHead sortKey="orgs" sort={table.sort} onToggle={table.toggleSort}>
                  {t("colOrgs")}
                </SortableHead>
                <SortableHead
                  sortKey="status"
                  sort={table.sort}
                  onToggle={table.toggleSort}
                  className="w-[178px]"
                >
                  {t("colStatus")}
                </SortableHead>
                <TableHead className="w-[170px] text-right">
                  <ReloadButton />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.length === 0 ? (
                <TableEmpty colSpan={5}>
                  {users.length === 0 ? t("empty") : tc("noResults")}
                </TableEmpty>
              ) : (
                table.rows.map((u) => {
                  const meta = STATUS_META[u.status]
                  const StatusIcon = meta?.icon
                  return (
                    <TableRow key={u.id} className="hover:bg-transparent">
                      <TableCell>
                        <Truncate className="max-w-full font-semibold">{u.name ?? "—"}</Truncate>
                        {u.isSystemAdmin && (
                          <span className="block text-[13px] text-muted-foreground">
                            {t("globalAdmin")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <Truncate className="max-w-full">{u.email}</Truncate>
                      </TableCell>
                      <TableCell
                        className={u.memberships.length ? undefined : "text-muted-foreground"}
                      >
                        <Truncate className="max-w-full">{orgsText(u)}</Truncate>
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta?.variant ?? "outline"}>
                          {StatusIcon && <StatusIcon />}
                          {statusLabel(u.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          {u.status === "INVITED" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-[26px]"
                              loading={resending === u.id}
                              disabled={busy === u.id}
                              onClick={() => resend(u)}
                              title={t("resendInvite")}
                            >
                              {t("resend")}
                            </Button>
                          )}
                          {/* O admin da aplicação não pode ser excluído por aqui. */}
                          {!u.isSystemAdmin && (
                            <ConfirmDialog
                              title={t("deleteTitle")}
                              description={t("deleteDesc", { email: u.email })}
                              confirmLabel={tc("delete")}
                              destructive
                              onConfirm={() => remove(u)}
                              trigger={
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-[26px] border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  disabled={busy === u.id}
                                >
                                  {tc("delete")}
                                </Button>
                              }
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  )
}
