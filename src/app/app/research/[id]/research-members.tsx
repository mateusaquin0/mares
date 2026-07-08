"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Plus, Trash2, Users } from "lucide-react"

import {
  useResearchMembers,
  useAddResearchMember,
  useRemoveResearchMember,
} from "@/hooks/use-research"
import { useMembers } from "@/hooks/use-members"
import { useErrorMessage } from "@/lib/use-error-message"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

// Gestão dos pesquisadores vinculados a uma pesquisa (escopo de visibilidade).
// Admin da org ou criador podem adicionar/remover; os demais membros só visualizam.
export function ResearchMembers({ researchId, orgId }: { researchId: string; orgId: string }) {
  const t = useTranslations("research")
  const tc = useTranslations("common")
  const em = useErrorMessage()

  const membersQ = useResearchMembers(researchId)
  const canManage = membersQ.data?.canManage ?? false
  // Candidatos: pesquisadores da org que ainda não são membros (carregado só p/ quem gere).
  const orgMembersQ = useMembers(orgId, canManage)
  const addM = useAddResearchMember(researchId)
  const removeM = useRemoveResearchMember(researchId)

  const [selected, setSelected] = useState<string>()

  const members = membersQ.data?.members ?? []
  const memberIds = new Set(members.map((m) => m.userId))
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
    try {
      await removeM.mutateAsync(userId)
      toast.success(t("memberRemoved"))
    } catch (err) {
      toast.error(t("memberRemoveError"), { description: em(err) })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="size-5 text-muted-foreground" />
          {t("membersTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("membersSubtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
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
                {canManage && <TableHead className="w-16 text-right" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 && (
                <TableEmpty colSpan={canManage ? 3 : 2}>{t("membersEmpty")}</TableEmpty>
              )}
              {members.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell className="font-medium">
                    <span className="flex flex-wrap items-center gap-2">
                      {m.name ?? m.email}
                      {m.isCreator && <Badge variant="secondary">{t("memberCreator")}</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      {!m.isCreator && (
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
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
