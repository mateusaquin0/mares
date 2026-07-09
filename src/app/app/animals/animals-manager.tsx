"use client"

import { useCallback, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Plus } from "lucide-react"

import { useAnimals, useAnimalFacets, useDeleteAnimal } from "@/hooks/use-animals"
import { useResearchList } from "@/hooks/use-research"
import { animalsService } from "@/services/animals"
import type { AnimalListItem, AnimalListQuery } from "@/types/animal"
import { useErrorMessage } from "@/lib/use-error-message"
import { Button } from "@/components/ui/button"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { AnimalsTable } from "./animals-table"
import { AnimalFormDialog } from "./animal-form"

const DEFAULT_QUERY: AnimalListQuery = {
  q: "",
  species: [],
  sex: [],
  lifeStage: [],
  state: [],
  research: [],
  pathogen: [],
  visibility: "all",
  samples: "all",
  from: "",
  to: "",
  sort: "date",
  dir: "desc",
  page: 1,
  pageSize: 20,
}

export function AnimalsManager({ isOrgAdmin }: { isOrgAdmin: boolean }) {
  const t = useTranslations("animals")
  const tc = useTranslations("common")
  const em = useErrorMessage()

  // Estado da consulta (filtros + ordenação + paginação), controlado aqui — a busca é
  // server-side. Qualquer mudança que não seja de página reinicia para a página 1.
  const [query, setQuery] = useState<AnimalListQuery>(DEFAULT_QUERY)
  const patchQuery = useCallback((patch: Partial<AnimalListQuery>) => {
    setQuery((q) => {
      const next = { ...q, ...patch }
      if (!("page" in patch)) next.page = 1
      return next
    })
  }, [])

  const animalsQ = useAnimals(query)
  const facetsQ = useAnimalFacets()
  const researchQ = useResearchList()

  const page = animalsQ.data
  const items = page?.items ?? []
  const total = page?.total ?? 0
  const researches = (researchQ.data ?? []).map((r) => ({ id: r.id, name: r.name }))

  // Skeleton só no primeiro carregamento (sem dados ainda); depois mantemos a tabela e
  // apenas esmaecemos durante o refetch (`isFetching`).
  const firstLoad = (animalsQ.isLoading && !page) || researchQ.isLoading
  const deleteM = useDeleteAnimal()

  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; id?: string } | null>(null)
  const [confirm, setConfirm] = useState<AnimalListItem | null>(null)

  const fetchFilteredIds = useCallback(() => animalsService.ids(query).then((r) => r.ids), [query])

  async function remove(a: AnimalListItem) {
    try {
      await deleteM.mutateAsync(a.id)
      toast.success(t("deleted"))
    } catch (err) {
      toast.error(t("deleteError"), { description: em(err) })
    }
  }

  const noResearch = researches.length === 0
  const defaultResearchId = researches.length === 1 ? researches[0].id : ""

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setDialog({ mode: "create" })} disabled={noResearch}>
          <Plus className="size-4" />
          {t("new")}
        </Button>
      </div>

      {firstLoad ? (
        <TableSkeleton />
      ) : noResearch ? (
        <p className="text-sm text-muted-foreground">{t("noResearch")}</p>
      ) : (
        <AnimalsTable
          items={items}
          total={total}
          query={query}
          patchQuery={patchQuery}
          facets={facetsQ.data}
          fetchFilteredIds={fetchFilteredIds}
          loading={animalsQ.isFetching}
          isOrgAdmin={isOrgAdmin}
          onEdit={(a) => setDialog({ mode: "edit", id: a.id })}
          onDelete={setConfirm}
        />
      )}

      {confirm && (
        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(o) => !o && setConfirm(null)}
          title={t("deleteTitle")}
          description={t("deleteDesc")}
          confirmLabel={tc("delete")}
          destructive
          onConfirm={() => remove(confirm)}
        />
      )}

      <AnimalFormDialog
        open={!!dialog}
        mode={dialog?.mode ?? "create"}
        animalId={dialog?.id}
        researches={researches}
        defaultResearchId={defaultResearchId}
        isOrgAdmin={isOrgAdmin}
        onOpenChange={(o) => !o && setDialog(null)}
        onSaved={() => {
          setDialog(null)
          animalsQ.refetch()
        }}
      />
    </div>
  )
}
