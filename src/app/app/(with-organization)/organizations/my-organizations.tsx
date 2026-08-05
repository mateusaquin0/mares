"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useErrorMessage } from "@/lib/use-error-message"
import { useLeaveOrganization } from "@/hooks/use-members"
import type { Membership } from "@/types/organization"
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

export function MyOrganizations({
  selfId,
  memberships,
}: {
  selfId: string
  memberships: Membership[]
}) {
  const router = useRouter()
  const t = useTranslations("myOrgs")
  const tc = useTranslations("common")
  const em = useErrorMessage()
  const [list, setList] = useState(memberships)
  const [busy, setBusy] = useState<string | null>(null)
  const leaveM = useLeaveOrganization()

  async function leave(m: Membership) {
    setBusy(m.orgId)
    let result: { orgDeactivated?: boolean }
    try {
      result = await leaveM.mutateAsync({ orgId: m.orgId, userId: selfId })
    } catch (err) {
      toast.error(t("leaveError"), { description: em(err) })
      return
    } finally {
      setBusy(null)
    }
    toast.success(result?.orgDeactivated ? t("orgDeactivated") : t("leftOrg"))
    setList((prev) => prev.filter((x) => x.orgId !== m.orgId))
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="max-w-3xl overflow-hidden rounded-xl border bg-card shadow-card">
        <Table className="table-fixed [&_td]:truncate">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50%]">{t("colOrg")}</TableHead>
              <TableHead className="w-[22%]">{t("colRole")}</TableHead>
              <TableHead className="w-[28%] text-right">
                <ReloadButton />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 && <TableEmpty colSpan={3}>{t("empty")}</TableEmpty>}
            {list.map((m) => (
              <TableRow key={m.orgId}>
                <TableCell className="font-medium">
                  <Truncate className="max-w-full">{m.orgName}</Truncate>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={m.role === "ORG_ADMIN" ? "default" : "secondary"}
                    className="max-w-full"
                  >
                    <span className="truncate">
                      {m.role === "ORG_ADMIN" ? tc("roleAdmin") : tc("roleResearcher")}
                    </span>
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <ConfirmDialog
                    title={t("leaveTitle")}
                    description={
                      m.role === "ORG_ADMIN"
                        ? t("leaveDescAdmin")
                        : t("leaveDesc", { org: m.orgName })
                    }
                    confirmLabel={tc("leave")}
                    destructive
                    onConfirm={() => leave(m)}
                    trigger={
                      <Button variant="outline" size="sm" disabled={busy === m.orgId}>
                        {tc("leave")}
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
