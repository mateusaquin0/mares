"use client"

// MARES — Compartilhamento de um indivíduo entre pesquisas do mesmo grupo (Etapa 1).
// Exibe a pesquisa primária + as participações e permite adicionar/remover pesquisas da org.
// Cada pesquisa mantém suas próprias amostras/análises sobre o indivíduo (grade por pesquisa
// na Etapa 2). Aqui tratamos apenas o vínculo (quem estuda o indivíduo).

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { X } from "lucide-react"

import { useResearchList } from "@/hooks/use-research"
import { useAddAnimalResearch, useRemoveAnimalResearch } from "@/hooks/use-animals"
import { useErrorMessage } from "@/lib/use-error-message"
import type { AnimalDetail } from "@/types/animal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function ResearchShare({ animal }: { animal: AnimalDetail }) {
  const t = useTranslations("animals")
  const em = useErrorMessage()
  const researchQ = useResearchList()
  const addM = useAddAnimalResearch(animal.id)
  const removeM = useRemoveAnimalResearch(animal.id)
  const [toAdd, setToAdd] = useState("")

  const participations = animal.participations.map((p) => p.research)
  // IDs já vinculados (primária + participações) — excluídos das opções de adicionar.
  const linkedIds = useMemo(
    () => new Set([animal.research.id, ...participations.map((r) => r.id)]),
    [animal.research.id, participations],
  )
  const available = (researchQ.data ?? []).filter((r) => !linkedIds.has(r.id))

  async function add() {
    if (!toAdd) return
    try {
      await addM.mutateAsync(toAdd)
      setToAdd("")
      toast.success(t("shareAdded"))
    } catch (err) {
      toast.error(t("shareError"), { description: em(err) })
    }
  }

  async function remove(researchId: string) {
    try {
      await removeM.mutateAsync(researchId)
      toast.success(t("shareRemoved"))
    } catch (err) {
      toast.error(t("shareError"), { description: em(err) })
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("shareTitle")}
        </p>
        <p className="text-xs text-muted-foreground">{t("shareDesc")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1.5">
          {animal.research.name}
          <span className="text-[10px] font-normal uppercase opacity-70">{t("sharePrimary")}</span>
        </Badge>
        {participations.map((r) => (
          <Badge key={r.id} variant="outline" className="gap-1 pr-1">
            {r.name}
            <button
              type="button"
              onClick={() => remove(r.id)}
              disabled={removeM.isPending}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label={t("shareRemove")}
              title={t("shareRemove")}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>

      {available.length > 0 && (
        <div className="flex items-center gap-2">
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
          <Button size="sm" variant="outline" onClick={add} disabled={!toAdd || addM.isPending}>
            {t("shareAddButton")}
          </Button>
        </div>
      )}
    </div>
  )
}
