"use client";

import type { ComponentType, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Search, ChevronDown, Fish, MapPin, Stethoscope, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SpeciesAutocomplete } from "@/components/species-autocomplete";
import { Field, TextField, TextareaField, SelectField } from "@/components/form";
import type { AnimalFormApi } from "./use-animal-form";
import type { ResearchOption } from ".";

// Props comuns a todas as seções: a fatia de estado/erros/mutação do formulário.
type SectionProps = Pick<AnimalFormApi, "form" | "errors" | "set">;

// Seção colapsável (accordion) com cabeçalho de ícone + título + chevron.
// Usa <details> nativo (acessível); aberta por padrão para não esconder campos.
function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <details open className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </span>
        <span className="text-sm font-semibold">{title}</span>
        <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t px-4 py-4">{children}</div>
    </details>
  );
}

// ── Identificação: pesquisa, espécie (WoRMS), IDs de controle/SIMBA ────────────
export function IdentificationSection({
  form,
  errors,
  set,
  mode,
  researches,
  fetchSimba,
  fetchingSimba,
}: SectionProps & {
  mode: "create" | "edit";
  researches: ResearchOption[];
  fetchSimba: () => void;
  fetchingSimba: boolean;
}) {
  const t = useTranslations("animals");

  return (
    <Section title={t("sectionIdentification")} icon={Fish}>
      {mode === "edit" ? (
        <Field htmlFor="research" label={t("research")} error={errors.researchId}>
          <Input
            disabled
            value={researches.find((r) => r.id === form.researchId)?.name ?? ""}
          />
        </Field>
      ) : (
        <SelectField
          id="research"
          label={t("research")}
          value={form.researchId}
          onValueChange={(v) => set({ researchId: v })}
          placeholder={t("researchPlaceholder")}
          error={errors.researchId}
          options={researches.map((r) => ({ value: r.id, label: r.name }))}
        />
      )}

      <Field htmlFor="species" label={t("species")} error={errors.species}>
        <SpeciesAutocomplete
          id="species"
          value={form.species}
          invalid={!!errors.species}
          onChange={(species, m) =>
            m
              ? set({
                  species: m.scientificName,
                  wormsAphiaId: String(m.aphiaId),
                  taxonFamily: m.family ?? "",
                  taxonOrder: m.order ?? "",
                })
              : // Edição manual desvincula do registro WoRMS.
                set({ species, wormsAphiaId: "" })
          }
        />
        {form.wormsAphiaId && (
          <p className="text-xs text-muted-foreground">
            {t("wormsLinked", {
              aphiaId: form.wormsAphiaId,
              taxon:
                [form.taxonFamily, form.taxonOrder].filter(Boolean).join(" · ") ||
                t("notInformed"),
            })}
          </p>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          id="controlId"
          label={t("controlId")}
          value={form.controlId}
          error={errors.controlId}
          onChange={(v) => set({ controlId: v })}
        />
        <Field
          htmlFor="simba"
          label={t("simbaRecordNumber")}
          optional
          error={errors.simbaRecordNumber}
        >
          <div className="flex items-center gap-2">
            <Input
              id="simba"
              value={form.simbaRecordNumber}
              aria-invalid={!!errors.simbaRecordNumber || undefined}
              onChange={(e) => set({ simbaRecordNumber: e.target.value })}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={fetchSimba}
              loading={fetchingSimba}
              disabled={!form.simbaRecordNumber.trim()}
              title={t("simbaFetch")}
            >
              {!fetchingSimba && <Search className="size-4" />}
            </Button>
          </div>
        </Field>
      </div>
    </Section>
  );
}

// ── Encalhe: data, praia, local e coordenadas ─────────────────────────────────
export function StrandingSection({ form, errors, set }: SectionProps) {
  const t = useTranslations("animals");

  return (
    <Section title={t("sectionStranding")} icon={MapPin}>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          id="eventDate"
          label={t("eventDate")}
          type="date"
          value={form.eventDate}
          error={errors.eventDate}
          onChange={(v) => set({ eventDate: v })}
        />
        <TextField
          id="beach"
          label={t("strandingBeach")}
          optional
          value={form.strandingBeach}
          error={errors.strandingBeach}
          onChange={(v) => set({ strandingBeach: v })}
        />
        <TextField
          id="municipality"
          label={t("municipality")}
          value={form.municipality}
          error={errors.municipality}
          onChange={(v) => set({ municipality: v })}
        />
        <TextField
          id="state"
          label={t("state")}
          value={form.state}
          error={errors.state}
          onChange={(v) => set({ state: v })}
        />
        <TextField
          id="lat"
          label={t("strandingLat")}
          type="number"
          step="any"
          value={form.strandingLat}
          error={errors.strandingLat}
          onChange={(v) => set({ strandingLat: v })}
        />
        <TextField
          id="lon"
          label={t("strandingLon")}
          type="number"
          step="any"
          value={form.strandingLon}
          error={errors.strandingLon}
          onChange={(v) => set({ strandingLon: v })}
        />
      </div>
    </Section>
  );
}

// ── Condição: sexo, estágio de vida, condição corporal e decomposição ─────────
export function ConditionSection({ form, errors, set }: SectionProps) {
  const t = useTranslations("animals");

  const sexOptions = [
    { value: "M", label: t("sexMale") },
    { value: "F", label: t("sexFemale") },
    { value: "U", label: t("sexUndetermined") },
  ];
  const lifeStageOptions = [
    { value: "FETUS", label: t("lifeStageFetus") },
    { value: "PUP", label: t("lifeStagePup") },
    { value: "JUVENILE", label: t("lifeStageJuvenile") },
    { value: "ADULT", label: t("lifeStageAdult") },
    { value: "UNDETERMINED", label: t("lifeStageUndetermined") },
  ];

  return (
    <Section title={t("sectionCondition")} icon={Stethoscope}>
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          id="sex"
          label={t("sex")}
          value={form.sex}
          onValueChange={(v) => set({ sex: v })}
          placeholder={t("sexPlaceholder")}
          error={errors.sex}
          options={sexOptions}
        />
        <SelectField
          id="lifeStage"
          label={t("lifeStage")}
          value={form.lifeStage}
          onValueChange={(v) => set({ lifeStage: v })}
          placeholder={t("lifeStagePlaceholder")}
          error={errors.lifeStage}
          options={lifeStageOptions}
        />
        <TextField
          id="bodyCondition"
          label={t("bodyCondition")}
          optional
          value={form.bodyCondition}
          error={errors.bodyCondition}
          onChange={(v) => set({ bodyCondition: v })}
        />
        <TextField
          id="decomp"
          label={t("decompositionStage")}
          optional
          value={form.decompositionStage}
          error={errors.decompositionStage}
          onChange={(v) => set({ decompositionStage: v })}
        />
        <TextField
          id="deathCondition"
          label={t("deathCondition")}
          optional
          value={form.deathCondition}
          error={errors.deathCondition}
          onChange={(v) => set({ deathCondition: v })}
        />
        <TextField
          id="necropsyDate"
          label={t("necropsyDate")}
          optional
          type="date"
          value={form.necropsyDate}
          error={errors.necropsyDate}
          onChange={(v) => set({ necropsyDate: v })}
        />
      </div>
    </Section>
  );
}

// ── Observações: notas macroscópicas e visibilidade (admin) ───────────────────
export function NotesSection({
  form,
  errors,
  set,
  isOrgAdmin,
}: SectionProps & { isOrgAdmin: boolean }) {
  const t = useTranslations("animals");

  return (
    <Section title={t("sectionNotes")} icon={FileText}>
      <TextareaField
        id="notes"
        label={t("macroscopicNotes")}
        optional
        rows={3}
        value={form.macroscopicNotes}
        error={errors.macroscopicNotes}
        onChange={(v) => set({ macroscopicNotes: v })}
      />
      {isOrgAdmin && (
        <div className="flex items-start gap-2">
          <Checkbox
            id="isHidden"
            checked={!form.isPublic}
            onCheckedChange={(v) => set({ isPublic: v !== true })}
            className="mt-0.5"
          />
          <Label
            htmlFor="isHidden"
            className="text-sm font-normal text-muted-foreground"
          >
            {t("isHiddenHint")}
          </Label>
        </div>
      )}
    </Section>
  );
}
