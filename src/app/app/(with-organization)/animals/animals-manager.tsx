"use client"

import { useCallback, useEffect, useState } from "react"
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
import { PendingSharesDialog } from "./pending-shares-dialog"

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
  hidden: "listed",
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

  // Excluir o último item de uma página deixaria a tabela vazia com registros nas anteriores.
  const emptyPastFirstPage = !!page && page.items.length === 0 && page.total > 0 && query.page > 1
  useEffect(() => {
    if (emptyPastFirstPage) setQuery((q) => ({ ...q, page: Math.max(1, q.page - 1) }))
  }, [emptyPastFirstPage])
  // Espelha a regra do servidor (DELETE /api/animals/[id]) para não oferecer um botão que
  // responderia 403/409: o pesquisador exclui o que é da pesquisa dele e não é compartilhado.
  const canDelete = useCallback(
    (a: AnimalListItem) =>
      isOrgAdmin ||
      (a.researches.length === 1 && (researchQ.data ?? []).some((r) => r.id === a.research.id)),
    [isOrgAdmin, researchQ.data],
  )

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
  const defaultResearchId = researches.length === 1 ? researches[0]!.id : ""

  return (
    <div className="flex h-full min-h-[48rem] flex-col gap-4 px-page pb-8 pt-3.5">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div>
          <h1 className="font-serif text-[28px] font-medium leading-8">{t("title")}</h1>
          <p className="mt-0.5 max-w-[820px] text-pretty text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Compartilhamentos aguardando resposta — só aparece quando há pendências. */}
          <PendingSharesDialog />
          {/* Botão desabilitado não recebe o hover: a dica fica no embrulho. */}
          <span title={noResearch ? t("noResearch") : undefined}>
            <Button onClick={() => setDialog({ mode: "create" })} disabled={noResearch}>
              <Plus className="size-4" />
              {t("new")}
            </Button>
          </span>
        </div>
      </div>

      {firstLoad ? (
        <TableSkeleton />
      ) : (
        <AnimalsTable
          items={items}
          total={total}
          query={query}
          patchQuery={patchQuery}
          facets={facetsQ.data}
          fetchFilteredIds={fetchFilteredIds}
          loading={animalsQ.isFetching}
          canDelete={canDelete}
          onEdit={(a) => setDialog({ mode: "edit", id: a.id })}
          onDelete={setConfirm}
          emptyText={noResearch ? t("noResearch") : undefined}
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
