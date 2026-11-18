"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Clock, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useErrorMessage } from "@/lib/use-error-message"
import { useLeaveOrganization } from "@/hooks/use-members"
import { useMyOrgRequest, useRequestNewOrg } from "@/hooks/use-organization-requests"
import type { Membership } from "@/types/organization"
import type { NewOrgRequestData } from "@/schemas/organization.schema"
import { NewOrgRequestDialog } from "./new-org-request-dialog"
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
  const [requesting, setRequesting] = useState(false)
  const leaveM = useLeaveOrganization()
  const requestQ = useMyOrgRequest()
  const requestM = useRequestNewOrg()

  // Uma solicitação por vez (o servidor recusa a segunda): com uma em aberto, o botão dá lugar
  // ao aviso de que ela está na fila do admin da aplicação.
  const pendingRequest = requestQ.data?.pending ?? null

  async function requestNewOrg(data: NewOrgRequestData) {
    try {
      await requestM.mutateAsync(data.organizationName)
      setRequesting(false)
      toast.success(t("requestSent"), { description: t("requestSentDesc") })
    } catch (err) {
      toast.error(t("requestError"), { description: em(err) })
    }
  }

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
    // Sem nenhum grupo, a área do grupo deixa de existir para a pessoa: vai direto para a
    // tela de quem não tem grupo. Depender do redirect do servidor durante um
    // router.refresh() falhava de forma intermitente. Navegação no cliente mantém o aviso.
    if (list.length <= 1) {
      router.replace("/app/no-organization")
      return
    }
    setList((prev) => prev.filter((x) => x.orgId !== m.orgId))
    router.refresh()
  }

  return (
    <div className="space-y-4 px-page pb-8 pt-3.5">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div>
          <h1 className="font-serif text-[28px] font-medium leading-8">{t("title")}</h1>
          <p className="mt-0.5 max-w-[820px] text-pretty text-muted-foreground">{t("subtitle")}</p>
        </div>
        {!pendingRequest && (
          <Button onClick={() => setRequesting(true)} disabled={requestQ.isLoading}>
            <Plus className="size-4" />
            {t("requestNew")}
          </Button>
        )}
      </div>

      {/* Pedido de grupo novo em análise: um por vez, por isso o botão some enquanto existe. */}
      {pendingRequest && (
        <div className="flex items-center gap-2 rounded-sm border border-warning bg-warning-subtle px-2.5 py-1.5 font-semibold text-warning">
          <Clock className="size-4 shrink-0" />
          {t("requestPending", { org: pendingRequest.organizationName })}
        </div>
      )}

      <div>
        <Table className="table-fixed [&_td]:truncate">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60%]">{t("colOrg")}</TableHead>
              <TableHead>{t("colRole")}</TableHead>
              <TableHead className="w-[120px] text-right">
                <ReloadButton />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 && <TableEmpty colSpan={3}>{t("empty")}</TableEmpty>}
            {list.map((m) => (
              <TableRow key={m.orgId} className="hover:bg-transparent">
                <TableCell className="font-semibold">
                  <Truncate className="max-w-full">{m.orgName}</Truncate>
                </TableCell>
                <TableCell>
                  {m.role === "ORG_ADMIN" ? tc("roleAdmin") : tc("roleResearcher")}
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
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-[26px]"
                        disabled={busy === m.orgId}
                      >
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

      <NewOrgRequestDialog
        open={requesting}
        onOpenChange={setRequesting}
        onSubmit={requestNewOrg}
      />
    </div>
  )
}
