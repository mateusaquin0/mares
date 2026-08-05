"use client"

import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAnimalForm } from "./use-animal-form"
import { ShareConflictDialog, VisibleConflictDialog } from "./share-conflict-dialog"
import { IdentificationSection, StrandingSection, ConditionSection, NotesSection } from "./sections"

export type ResearchOption = { id: string; name: string }

// Diálogo de criar/editar animal. A lógica vive em `useAnimalForm`; aqui só
// montamos o modal e as seções do formulário.
export function AnimalFormDialog({
  open,
  mode,
  animalId,
  researches,
  defaultResearchId,
  isOrgAdmin,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  mode: "create" | "edit"
  animalId?: string
  researches: ResearchOption[]
  defaultResearchId: string
  isOrgAdmin: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const t = useTranslations("animals")
  const tc = useTranslations("common")
  const f = useAnimalForm({
    open,
    mode,
    animalId,
    defaultResearchId,
    isOrgAdmin,
    onSaved,
  })

  // Nome da pesquisa escolhida no formulário — é ela que receberá o indivíduo, se o pedido
  // de compartilhamento for aceito.
  const researchName = researches.find((r) => r.id === f.form.researchId)?.name ?? ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dirty={f.isDirty}
        className="max-w-2xl"
        // Na edição, a "pesquisa" é um input desabilitado, então o foco automático
        // do Radix cairia na espécie. Evita focar qualquer campo ao abrir.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={f.submit} className="flex min-h-0 flex-1 flex-col gap-4">
          <DialogBody className="space-y-4">
            <IdentificationSection
              form={f.form}
              errors={f.errors}
              set={f.set}
              mode={mode}
              researches={researches}
              fetchSimba={f.fetchSimba}
              fetchingSimba={f.fetchingSimba}
              speciesIndet={f.speciesIndet}
              toggleSpeciesIndet={f.toggleSpeciesIndet}
              checkIdentifier={f.checkIdentifier}
              checkingId={f.checkingId}
            />
            <StrandingSection
              form={f.form}
              errors={f.errors}
              set={f.set}
              disabled={f.disabled}
              toggleDisabled={f.toggleDisabled}
            />
            <ConditionSection form={f.form} errors={f.errors} set={f.set} />
            <NotesSection form={f.form} errors={f.errors} set={f.set} isOrgAdmin={isOrgAdmin} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button
              type="submit"
              loading={f.saving}
              className="bg-bio text-bio-foreground hover:bg-bio/90"
            >
              {mode === "edit" ? tc("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>

        {/* Indivíduo já cadastrado numa pesquisa que o usuário não acessa: em vez de um erro
            sem saída, mostra o registro existente e oferece pedir o compartilhamento. */}
        {f.shareConflict && (
          <ShareConflictDialog
            conflict={f.shareConflict}
            researchName={researchName}
            onClose={f.dismissShareConflict}
            onRequest={f.requestShare}
          />
        )}
        {/* Identificador de um indivíduo que o usuário já enxerga: atalho para abrir o
            registro existente em nova aba. */}
        {f.visibleConflict && (
          <VisibleConflictDialog conflict={f.visibleConflict} onClose={f.dismissVisibleConflict} />
        )}
      </DialogContent>
    </Dialog>
  )
}
