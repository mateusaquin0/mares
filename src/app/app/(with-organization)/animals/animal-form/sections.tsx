"use client"

import type { ComponentType, ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Search, ChevronDown, Fish, MapPin, Stethoscope, FileText, Ban } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { SpeciesAutocomplete } from "@/components/species-autocomplete"
import { Field, TextField, TextareaField, SelectField } from "@/components/form"
import { LIMITS } from "@/schemas/limits"
import { SEX_OPTIONS, LIFE_STAGE_OPTIONS } from "@/lib/animal-enums"
import type { AnimalFormApi } from "./use-animal-form"
import type { ResearchOption } from "."

// Props comuns a todas as seções: a fatia de estado/erros/mutação do formulário.
type SectionProps = Pick<AnimalFormApi, "form" | "errors" | "set">

// Seção colapsável (accordion) com cabeçalho de ícone + título + chevron.
// Usa <details> nativo (acessível); aberta por padrão para não esconder campos.
function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: ComponentType<{ className?: string }>
  children: ReactNode
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
  )
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
  speciesIndet,
  toggleSpeciesIndet,
  checkIdentifier,
  checkingId,
}: SectionProps & {
  mode: "create" | "edit"
  researches: ResearchOption[]
  fetchSimba: () => void
  fetchingSimba: boolean
  speciesIndet: boolean
  toggleSpeciesIndet: () => void
  checkIdentifier: (field: "controlId" | "simbaRecordNumber") => void
  checkingId: boolean
}) {
  const t = useTranslations("animals")

  return (
    <Section title={t("sectionIdentification")} icon={Fish}>
      {mode === "edit" ? (
        <Field htmlFor="research" label={t("research")} error={errors.researchId}>
          <Input disabled value={researches.find((r) => r.id === form.researchId)?.name ?? ""} />
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

      {/* Espécie com botão "indeterminado" (mesmo padrão dos campos de encalhe): ao marcar,
          o autocomplete é desabilitado e a espécie vai como null. */}
      <Field
        htmlFor="species"
        label={t("species")}
        error={speciesIndet ? undefined : errors.species}
      >
        <div className="flex items-center gap-2">
          {speciesIndet ? (
            <Input disabled value="" placeholder={t("speciesUndetermined")} className="flex-1" />
          ) : (
            <div className="flex-1">
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
            </div>
          )}
          <Button
            type="button"
            variant={speciesIndet ? "secondary" : "outline"}
            size="icon"
            className="shrink-0"
            onClick={toggleSpeciesIndet}
            title={speciesIndet ? t("speciesUndeterminedEnable") : t("speciesUndeterminedMark")}
            aria-pressed={speciesIndet}
          >
            <Ban className={speciesIndet ? "size-4 text-destructive" : "size-4"} />
          </Button>
        </div>
        {!speciesIndet && form.wormsAphiaId && (
          <p className="text-xs text-muted-foreground">
            {t("wormsLinked", {
              aphiaId: form.wormsAphiaId,
              taxon:
                [form.taxonFamily, form.taxonOrder].filter(Boolean).join(" · ") || t("notInformed"),
            })}
          </p>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        {/* O ID de controle é único por ORGANIZAÇÃO, mas a listagem é filtrada por pesquisa:
            a lupa confere se o identificador já existe no grupo antes de a pessoa preencher
            o resto do formulário — inclusive em pesquisas que ela não enxerga. */}
        <Field htmlFor="controlId" label={t("controlId")} error={errors.controlId}>
          <div className="flex items-center gap-2">
            <Input
              id="controlId"
              value={form.controlId}
              maxLength={LIMITS.shortText}
              aria-invalid={!!errors.controlId || undefined}
              onChange={(e) => set({ controlId: e.target.value })}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => checkIdentifier("controlId")}
              loading={checkingId}
              disabled={!form.controlId.trim()}
              title={t("idCheck")}
            >
              {!checkingId && <Search className="size-4" />}
            </Button>
          </div>
        </Field>
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
              maxLength={LIMITS.shortText}
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
  )
}

// Campo de encalhe com botão "sem informação": desabilita e limpa o campo para casos
// em que o dado é desconhecido (o valor vai como nulo). Reabilita ao clicar de novo.
function StrandingField({
  id,
  label,
  type,
  step,
  maxLength,
  value,
  error,
  disabled,
  onChange,
  onToggle,
}: {
  id: string
  label: string
  type?: string
  step?: string
  maxLength?: number
  value: string
  error?: string
  disabled: boolean
  onChange: (value: string) => void
  onToggle: () => void
}) {
  const t = useTranslations("animals")
  return (
    <Field htmlFor={id} label={label} error={disabled ? undefined : error}>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type={type}
          step={step}
          maxLength={maxLength}
          value={disabled ? "" : value}
          disabled={disabled}
          placeholder={disabled ? t("noInfo") : undefined}
          aria-invalid={!disabled && !!error ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          type="button"
          variant={disabled ? "secondary" : "outline"}
          size="icon"
          className="shrink-0"
          onClick={onToggle}
          title={disabled ? t("noInfoEnable") : t("noInfoMark")}
          aria-pressed={disabled}
        >
          <Ban className={disabled ? "size-4 text-destructive" : "size-4"} />
        </Button>
      </div>
    </Field>
  )
}

// ── Encalhe: data, praia, local e coordenadas ─────────────────────────────────
// Os campos obrigatórios de encalhe podem ser marcados como "sem informação" (botão ao
// lado), para registros em que o dado não está disponível.
export function StrandingSection({
  form,
  errors,
  set,
  disabled,
  toggleDisabled,
}: SectionProps & Pick<AnimalFormApi, "disabled" | "toggleDisabled">) {
  const t = useTranslations("animals")

  return (
    <Section title={t("sectionStranding")} icon={MapPin}>
      <div className="grid grid-cols-2 gap-3">
        <StrandingField
          id="eventDate"
          label={t("eventDate")}
          type="date"
          value={form.eventDate}
          error={errors.eventDate}
          disabled={!!disabled.eventDate}
          onToggle={() => toggleDisabled("eventDate")}
          // A necrópsia costuma ocorrer no dia do encalhe: reflete a data do encalhe na
          // necrópsia enquanto esta estiver vazia (não sobrescreve um valor já informado).
          onChange={(v) =>
            set(form.necropsyDate ? { eventDate: v } : { eventDate: v, necropsyDate: v })
          }
        />
        <TextField
          id="beach"
          label={t("strandingBeach")}
          optional
          value={form.strandingBeach}
          error={errors.strandingBeach}
          maxLength={LIMITS.name}
          onChange={(v) => set({ strandingBeach: v })}
        />
        <StrandingField
          id="municipality"
          label={t("municipality")}
          value={form.municipality}
          error={errors.municipality}
          maxLength={LIMITS.shortText}
          disabled={!!disabled.municipality}
          onToggle={() => toggleDisabled("municipality")}
          onChange={(v) => set({ municipality: v })}
        />
        <StrandingField
          id="state"
          label={t("state")}
          value={form.state}
          error={errors.state}
          maxLength={LIMITS.shortText}
          disabled={!!disabled.state}
          onToggle={() => toggleDisabled("state")}
          onChange={(v) => set({ state: v })}
        />
        <StrandingField
          id="lat"
          label={t("strandingLat")}
          type="number"
          step="any"
          value={form.strandingLat}
          error={errors.strandingLat}
          disabled={!!disabled.strandingLat}
          onToggle={() => toggleDisabled("strandingLat")}
          onChange={(v) => set({ strandingLat: v })}
        />
        <StrandingField
          id="lon"
          label={t("strandingLon")}
          type="number"
          step="any"
          value={form.strandingLon}
          error={errors.strandingLon}
          disabled={!!disabled.strandingLon}
          onToggle={() => toggleDisabled("strandingLon")}
          onChange={(v) => set({ strandingLon: v })}
        />
      </div>
    </Section>
  )
}

// ── Condição: sexo, estágio de vida, condição corporal e decomposição ─────────
export function ConditionSection({ form, errors, set }: SectionProps) {
  const t = useTranslations("animals")

  // Valores canônicos em src/lib/animal-enums.ts; aqui só resolvemos o rótulo i18n.
  const sexOptions = SEX_OPTIONS.map((o) => ({ value: o.value, label: t(o.key) }))
  const lifeStageOptions = LIFE_STAGE_OPTIONS.map((o) => ({ value: o.value, label: t(o.key) }))

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
          maxLength={LIMITS.tinyText}
          onChange={(v) => set({ bodyCondition: v })}
        />
        <TextField
          id="decomp"
          label={t("decompositionStage")}
          optional
          value={form.decompositionStage}
          error={errors.decompositionStage}
          maxLength={LIMITS.tinyText}
          onChange={(v) => set({ decompositionStage: v })}
        />
        <TextField
          id="deathCondition"
          label={t("deathCondition")}
          optional
          value={form.deathCondition}
          error={errors.deathCondition}
          maxLength={LIMITS.tinyText}
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
  )
}

// ── Observações: notas macroscópicas e visibilidade (admin) ───────────────────
export function NotesSection({
  form,
  errors,
  set,
  isOrgAdmin,
}: SectionProps & { isOrgAdmin: boolean }) {
  const t = useTranslations("animals")

  return (
    <Section title={t("sectionNotes")} icon={FileText}>
      <TextareaField
        id="notes"
        label={t("macroscopicNotes")}
        optional
        rows={3}
        max={LIMITS.hugeText}
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
          <Label htmlFor="isHidden" className="text-sm font-normal text-muted-foreground">
            {t("isHiddenHint")}
          </Label>
        </div>
      )}
    </Section>
  )
}
