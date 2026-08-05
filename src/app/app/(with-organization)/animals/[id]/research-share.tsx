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

import * as React from "react"
import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Clock, X } from "lucide-react"

import { useResearchCatalog, useResearchList } from "@/hooks/use-research"
import { useShareAnimal, useRemoveAnimalResearch } from "@/hooks/use-animals"
import { useErrorMessage } from "@/lib/use-error-message"
import type { AnimalDetail } from "@/types/animal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Truncate } from "@/components/ui/truncate"
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

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("shareTitle")}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("shareDesc")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ShareGroup label={t("sharePrimaryLabel")}>
          <Badge variant="secondary">
            <ShareName>{animal.research.name}</ShareName>
          </Badge>
        </ShareGroup>

        <ShareGroup
          label={t("shareAlsoLabel")}
          empty={accepted.length === 0 ? t("shareNone") : null}
        >
          {accepted.map((p) => (
            <Badge
              key={p.research.id}
              variant="outline"
              className={canUnlink(p.research.id) ? "gap-1 pr-1" : undefined}
            >
              <ShareName>{p.research.name}</ShareName>
              {canUnlink(p.research.id) && (
                <RemoveButton
                  label={t("shareRemove")}
                  disabled={removeM.isPending}
                  onClick={() => remove(p.research.id, false)}
                />
              )}
            </Badge>
          ))}
        </ShareGroup>

        {pending.length > 0 && (
          <ShareGroup label={t("sharePendingLabel")} hint={t("sharePendingHint")}>
            {pending.map((p) => (
              <Badge
                key={p.research.id}
                variant="outline"
                className="gap-1 border-dashed pr-1 text-muted-foreground"
              >
                <Clock className="size-3 shrink-0" />
                <ShareName>{p.research.name}</ShareName>
                {canUnlink(p.research.id) && (
                  <RemoveButton
                    label={t("shareInviteCancel")}
                    disabled={removeM.isPending}
                    onClick={() => remove(p.research.id, true)}
                  />
                )}
              </Badge>
            ))}
          </ShareGroup>
        )}
      </div>

      {available.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Select value={toAdd} onValueChange={setToAdd}>
            <SelectTrigger className="h-9 w-64">
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
          <Button size="sm" variant="outline" onClick={add} disabled={!toAdd || shareM.isPending}>
            {t("shareAddButton")}
          </Button>
        </div>
      )}
    </div>
  )
}

// Nome da pesquisa dentro do selo: nomes longos são a regra, então corta com reticências
// (o texto completo fica no tooltip) para o selo não dominar a linha.
function ShareName({ children }: { children: React.ReactNode }) {
  return <Truncate className="max-w-[10rem]">{children}</Truncate>
}

// Um grupo rotulado de selos (de origem / também estudam / em aberto).
function ShareGroup({
  label,
  hint,
  empty,
  children,
}: {
  label: string
  hint?: string
  empty?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground" title={hint}>
        {label}
      </p>
      {empty ? (
        <span className="text-sm text-muted-foreground">{empty}</span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  )
}

function RemoveButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      aria-label={label}
      title={label}
    >
      <X className="size-3" />
    </button>
  )
}
