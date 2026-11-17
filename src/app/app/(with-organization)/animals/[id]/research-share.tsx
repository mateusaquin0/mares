"use client"

// MARES — Compartilhamento de um indivíduo entre pesquisas do mesmo grupo.
//
// Exibe a pesquisa primária, as participações ACEITAS e os pedidos ainda PENDENTES, e permite
// envolver outra pesquisa do grupo. O destino sai do CATÁLOGO (todas as pesquisas da org), não
// do escopo do usuário: era justamente isso que travava quem só participa da própria pesquisa.
//
// O vínculo só passa a valer quando o outro lado aceita — quem convida não decide sozinho.
// Cada pesquisa mantém suas próprias amostras/análises sobre o indivíduo; aqui tratamos
// apenas o vínculo (quem estuda o indivíduo).
//
// Cada pesquisa também pode ARQUIVAR o indivíduo compartilhado na própria listagem (é a saída
// quando ele não pode ser excluído) e restaurá-lo depois.

import * as React from "react"
import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Archive, ArchiveRestore, Clock, X } from "lucide-react"

import { useResearchCatalog, useResearchList } from "@/hooks/use-research"
import { useRemoveAnimalResearch, useSetAnimalHidden, useShareAnimal } from "@/hooks/use-animals"
import { useErrorMessage } from "@/lib/use-error-message"
import type { AnimalDetail } from "@/types/animal"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DataRow, SectionTitle } from "@/components/ui/section"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function ResearchShare({
  animal,
  isOrgAdmin,
}: {
  animal: AnimalDetail
  isOrgAdmin: boolean
}) {
  const t = useTranslations("animals")
  const em = useErrorMessage()
  const catalogQ = useResearchCatalog()
  // Pesquisas do PRÓPRIO escopo (não o catálogo): definem o que o usuário pode desfazer.
  const myResearchQ = useResearchList()
  const shareM = useShareAnimal(animal.id)
  const removeM = useRemoveAnimalResearch(animal.id)
  const hiddenM = useSetAnimalHidden(animal.id)
  const [toAdd, setToAdd] = useState("")

  const accepted = animal.participations.filter((p) => p.status === "ACCEPTED")
  const pending = animal.participations.filter((p) => p.status === "PENDING")

  // Desfazer um vínculo é prerrogativa dos DOIS lados dele — a pesquisa de origem do indivíduo e
  // a pesquisa vinculada — nunca de uma terceira que apenas também estuda o indivíduo. O
  // servidor aplica essa regra (ver DELETE .../researches/[researchId]); aqui só evitamos
  // oferecer um botão que responderia 403.
  const mine = useMemo(() => new Set((myResearchQ.data ?? []).map((r) => r.id)), [myResearchQ.data])
  const ownsAnimal = isOrgAdmin || mine.has(animal.research.id)
  const canUnlink = (researchId: string) => ownsAnimal || mine.has(researchId)

  // Arquivar é decisão de cada pesquisa sobre a própria listagem (o servidor aplica a mesma
  // regra).
  const canToggleHidden = (researchId: string) => isOrgAdmin || mine.has(researchId)
  const linked = [
    { research: animal.research, hidden: !!animal.primaryHiddenAt },
    ...accepted.map((p) => ({ research: p.research, hidden: !!p.hiddenAt })),
  ]
  const isHidden = (researchId: string) =>
    linked.some((l) => l.research.id === researchId && l.hidden)
  const hiddenInMine = linked.filter((l) => l.hidden && mine.has(l.research.id))

  // IDs já envolvidos (primária + participações + pendentes) — fora das opções de adicionar.
  const linkedIds = useMemo(
    () => new Set([animal.research.id, ...animal.participations.map((p) => p.research.id)]),
    [animal.research.id, animal.participations],
  )
  const available = (catalogQ.data ?? []).filter((r) => !linkedIds.has(r.id))

  async function add() {
    if (!toAdd) return
    try {
      const { status } = await shareM.mutateAsync({ researchId: toAdd })
      setToAdd("")
      // Compartilhar com uma pesquisa que o próprio usuário integra vale na hora; com uma
      // pesquisa de terceiros, fica aguardando o aceite dela.
      toast.success(status === "ACCEPTED" ? t("shareAdded") : t("shareInviteSent"))
    } catch (err) {
      toast.error(t("shareError"), { description: em(err) })
    }
  }

  async function remove(researchId: string, wasPending: boolean) {
    try {
      await removeM.mutateAsync(researchId)
      toast.success(wasPending ? t("shareInviteCanceled") : t("shareRemoved"))
    } catch (err) {
      toast.error(t("shareError"), { description: em(err) })
    }
  }

  async function toggleHidden(researchId: string, hidden: boolean) {
    try {
      await hiddenM.mutateAsync({ researchId, hidden })
      toast.success(hidden ? t("archiveDone") : t("restoreDone"))
    } catch (err) {
      toast.error(t("archiveError"), { description: em(err) })
    }
  }

  // Arquivar só faz sentido com o indivíduo compartilhado; restaurar é sempre possível.
  const archiveAction = (researchId: string) =>
    canToggleHidden(researchId) && (isHidden(researchId) || accepted.length > 0) ? (
      <IconAction
        icon={isHidden(researchId) ? ArchiveRestore : Archive}
        label={isHidden(researchId) ? t("restoreAction") : t("archiveAction")}
        disabled={hiddenM.isPending}
        onClick={() => toggleHidden(researchId, !isHidden(researchId))}
      />
    ) : null

  return (
    <section>
      <SectionTitle>{t("shareTitle")}</SectionTitle>
      <p className="mb-0.5 mt-1.5 text-pretty text-[13px] leading-[18px] text-muted-foreground">
        {t("shareDesc")}
      </p>

      {hiddenInMine.length > 0 && (
        <div className="my-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-sm border border-input bg-muted px-2.5 py-1.5">
          <Archive className="size-4 shrink-0" />
          <span className="min-w-0 flex-[1_1_220px] text-pretty font-semibold">
            {t("archivedNotice", { research: hiddenInMine.map((l) => l.research.name).join(", ") })}
          </span>
          {hiddenInMine.map((l) => (
            <Button
              key={l.research.id}
              size="sm"
              variant="outline"
              className="h-[26px] bg-popover font-semibold"
              disabled={hiddenM.isPending}
              onClick={() => toggleHidden(l.research.id, false)}
            >
              <ArchiveRestore className="size-4" />
              {hiddenInMine.length > 1
                ? t("restoreIn", { research: l.research.name })
                : t("restoreAction")}
            </Button>
          ))}
        </div>
      )}

      <dl>
        <DataRow label={t("sharePrimaryLabel")} labelWidth="38%" className="py-1.5">
          <ShareItem
            name={animal.research.name}
            archived={isHidden(animal.research.id)}
            archivedLabel={t("archivedTag")}
          >
            {archiveAction(animal.research.id)}
          </ShareItem>
        </DataRow>

        <DataRow label={t("shareAlsoLabel")} labelWidth="38%" className="py-1.5">
          {accepted.length === 0 ? (
            <span className="text-muted-foreground">{t("shareNone")}</span>
          ) : (
            <div className="flex flex-col gap-1">
              {accepted.map((p) => (
                <ShareItem
                  key={p.research.id}
                  name={p.research.name}
                  archived={isHidden(p.research.id)}
                  archivedLabel={t("archivedTag")}
                >
                  {archiveAction(p.research.id)}
                  {canUnlink(p.research.id) && (
                    <IconAction
                      icon={X}
                      label={t("shareRemove")}
                      disabled={removeM.isPending}
                      onClick={() => remove(p.research.id, false)}
                    />
                  )}
                </ShareItem>
              ))}
            </div>
          )}
        </DataRow>

        {pending.length > 0 && (
          <DataRow
            label={t("sharePendingLabel")}
            labelWidth="38%"
            title={t("sharePendingHint")}
            className="py-1.5"
          >
            <div className="flex flex-col gap-1">
              {pending.map((p) => (
                <ShareItem key={p.research.id} name={p.research.name} pending>
                  {canUnlink(p.research.id) && (
                    <IconAction
                      icon={X}
                      label={t("shareInviteCancel")}
                      disabled={removeM.isPending}
                      onClick={() => remove(p.research.id, true)}
                    />
                  )}
                </ShareItem>
              ))}
              <span className="text-pretty text-[13px] leading-[18px] text-muted-foreground">
                {t("sharePendingHint")}
              </span>
            </div>
          </DataRow>
        )}
      </dl>

      {available.length > 0 && (
        <div className="mt-2.5 flex gap-2">
          <Select value={toAdd} onValueChange={setToAdd}>
            <SelectTrigger className="min-w-0 flex-1">
              <SelectValue placeholder={t("shareAddPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {available.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={add} disabled={!toAdd || shareM.isPending}>
            {t("shareAddButton")}
          </Button>
        </div>
      )}
    </section>
  )
}

// Uma pesquisa na lista: nome cortado com o texto inteiro na dica, selo de arquivado e as
// ações à direita.
function ShareItem({
  name,
  archived,
  archivedLabel,
  pending,
  children,
}: {
  name: string
  archived?: boolean
  archivedLabel?: string
  pending?: boolean
  children?: React.ReactNode
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {pending && <Clock className="size-4 shrink-0 text-warning" />}
      <span
        title={name}
        className={cn("min-w-0 truncate font-medium", pending && "text-muted-foreground")}
      >
        {name}
      </span>
      {archived && (
        <span className="shrink-0 rounded-sm border border-input px-1.5 text-xs font-semibold text-muted-foreground">
          {archivedLabel}
        </span>
      )}
      <span className="flex-1" />
      {children}
    </span>
  )
}

function IconAction({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: typeof X
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <Icon className="size-4" />
    </button>
  )
}
