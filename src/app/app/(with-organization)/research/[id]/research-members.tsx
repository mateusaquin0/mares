"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { LogOut, Plus, Trash2 } from "lucide-react"

import {
  useResearchMembers,
  useAddResearchMember,
  useRemoveResearchMember,
  useLeaveResearch,
} from "@/hooks/use-research"
import { useMembers } from "@/hooks/use-members"
import { useErrorMessage } from "@/lib/use-error-message"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
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

// Gestão dos pesquisadores vinculados a uma pesquisa (escopo de visibilidade).
// Admin da org ou criador podem adicionar/remover; os demais membros só visualizam — mas
// qualquer um pode SAIR do próprio vínculo (não precisa de autorização para deixar de ver).
export function ResearchMembers({
  researchId,
  researchName,
  orgId,
  selfId,
  isOrgAdmin,
}: {
  researchId: string
  researchName: string
  orgId: string
  selfId: string
  isOrgAdmin: boolean
}) {
  const t = useTranslations("research")
  const tc = useTranslations("common")
  const em = useErrorMessage()
  const router = useRouter()

  const membersQ = useResearchMembers(researchId)
  const canManage = membersQ.data?.canManage ?? false
  // Candidatos: pesquisadores da org que ainda não são membros (carregado só p/ quem gere).
  const orgMembersQ = useMembers(orgId, canManage)
  const addM = useAddResearchMember(researchId)
  const removeM = useRemoveResearchMember(researchId)
  const leaveM = useLeaveResearch()

  const [selected, setSelected] = useState<string>()

  const members = membersQ.data?.members ?? []
  const memberIds = new Set(members.map((m) => m.userId))
  // Coluna de ações: quem gere (remover) ou quem está na lista (sair do próprio vínculo).
  const showActions = canManage || memberIds.has(selfId)
  const candidates: ComboboxOption[] = (orgMembersQ.data ?? [])
    .filter((m) => m.role === "RESEARCHER" && !memberIds.has(m.userId))
    .map((m) => ({ value: m.userId, label: m.name ? `${m.name} · ${m.email}` : m.email }))

  async function add() {
    if (!selected) return
    try {
      await addM.mutateAsync(selected)
      setSelected(undefined)
      toast.success(t("memberAdded"))
    } catch (err) {
      toast.error(t("memberAddError"), { description: em(err) })
    }
  }

  async function remove(userId: string) {
    // Sair de si mesmo tem consequência diferente de remover outra pessoa: o usuário perde o
    // acesso a ESTA página, então volta para a lista de pesquisas com o cache de escopo limpo.
    if (userId === selfId) return leave()
    try {
      await removeM.mutateAsync(userId)
      toast.success(t("memberRemoved"))
    } catch (err) {
      toast.error(t("memberRemoveError"), { description: em(err) })
    }
  }

  // O admin do grupo enxerga as pesquisas por PAPEL, não por vínculo: sair só o tira da lista
  // de membros, sem perder acesso — então nem a mensagem nem o redirect valem para ele.
  async function leave() {
    try {
      await leaveM.mutateAsync({ researchId, userId: selfId })
      toast.success(isOrgAdmin ? t("leftResearchAdmin") : t("leftResearch"), {
        description: isOrgAdmin ? t("leftResearchAdminDesc") : t("leftResearchDesc"),
      })
      if (!isOrgAdmin) router.push("/app/research")
    } catch (err) {
      toast.error(t("leaveError"), { description: em(err) })
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("membersSubtitle")}</p>
      {canManage && (
        <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[1fr_auto]">
          <Combobox
            options={candidates}
            value={selected}
            onChange={setSelected}
            placeholder={t("selectResearcher")}
            searchPlaceholder={tc("search")}
            emptyText={t("noCandidates")}
            loading={orgMembersQ.isLoading}
          />
          <Button onClick={add} disabled={!selected} loading={addM.isPending}>
            <Plus className="size-4" />
            {tc("add")}
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colName")}</TableHead>
              <TableHead>{tc("email")}</TableHead>
              {showActions && <TableHead className="w-16 text-right" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 && (
              <TableEmpty colSpan={showActions ? 3 : 2}>{t("membersEmpty")}</TableEmpty>
            )}
            {members.map((m) => (
              <TableRow key={m.userId}>
                <TableCell className="font-medium">
                  <span className="flex flex-wrap items-center gap-2">
                    <Truncate>{m.name ?? m.email}</Truncate>
                    {m.isCreator && <Badge variant="secondary">{t("memberCreator")}</Badge>}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <Truncate>{m.email}</Truncate>
                </TableCell>
                {showActions && (
                  <TableCell className="text-right">
                    {/* Na própria linha a ação é "sair" (disponível a qualquer membro); nas
                        demais, "remover" — e só para quem gere a pesquisa. */}
                    {m.userId === selfId ? (
                      <ConfirmDialog
                        title={t("leaveTitle")}
                        description={t(isOrgAdmin ? "leaveDescAdmin" : "leaveDesc", {
                          name: researchName,
                        })}
                        confirmLabel={t("leave")}
                        destructive
                        onConfirm={() => leave()}
                        trigger={
                          <Button variant="ghost" size="sm" className="text-destructive">
                            <LogOut className="size-4" />
                            {t("leave")}
                          </Button>
                        }
                      />
                    ) : (
                      canManage && (
                        <ConfirmDialog
                          title={t("memberRemoveTitle")}
                          description={t("memberRemoveDesc", { name: m.name ?? m.email })}
                          confirmLabel={tc("remove")}
                          destructive
                          onConfirm={() => remove(m.userId)}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive"
                              aria-label={tc("remove")}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          }
                        />
                      )
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
