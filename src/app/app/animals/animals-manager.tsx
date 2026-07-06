"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { useAnimals, useDeleteAnimal } from "@/hooks/use-animals";
import { useResearchList } from "@/hooks/use-research";
import type { AnimalListItem } from "@/types/animal";
import { useErrorMessage } from "@/lib/use-error-message";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AnimalsTable } from "./animals-table";
import { AnimalFormDialog } from "./animal-form";

export function AnimalsManager({ isOrgAdmin }: { isOrgAdmin: boolean }) {
  const t = useTranslations("animals");
  const tc = useTranslations("common");
  const em = useErrorMessage();

  const animalsQ = useAnimals();
  const researchQ = useResearchList();
  const items = animalsQ.data ?? [];
  const researches = (researchQ.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
  }));
  const loading = animalsQ.isLoading || researchQ.isLoading;
  const deleteM = useDeleteAnimal();

  // Diálogo de criar/editar e confirmação de exclusão.
  const [dialog, setDialog] = useState<{
    mode: "create" | "edit";
    id?: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<AnimalListItem | null>(null);

  async function remove(a: AnimalListItem) {
    try {
      await deleteM.mutateAsync(a.id);
      toast.success(t("deleted"));
    } catch (err) {
      toast.error(t("deleteError"), { description: em(err) });
    }
  }

  const noResearch = researches.length === 0;
  const defaultResearchId = researches.length === 1 ? researches[0].id : "";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
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

      {loading ? (
        <TableSkeleton />
      ) : noResearch ? (
        <p className="text-sm text-muted-foreground">{t("noResearch")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <AnimalsTable
          items={items}
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
          setDialog(null);
          animalsQ.refetch();
        }}
      />
    </div>
  );
}
