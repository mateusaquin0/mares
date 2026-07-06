"use client"

// MARES — Explorador do mapa: barra de filtros (multisseleção) + mapa Leaflet.
// Os filtros são aplicados no cliente sobre os pontos já carregados; o mapa em si é montado
// por import dinâmico (ssr:false) por depender de `window`.

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useTranslations, useLocale } from "next-intl"
import { Globe, Lock, X } from "lucide-react"

import type { MapPoint } from "@/lib/map-points"
import type { PopupLabels } from "@/components/map/leaflet-map"
import { SEX_OPTIONS, LIFE_STAGE_OPTIONS } from "@/lib/animal-enums"
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const ALL = "__all__"

// Valores distintos, não-nulos, ordenados por locale — base das opções de filtro.
function distinctSorted(values: (string | null)[], locale: string): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) =>
    a.localeCompare(b, locale)
  )
}

// O mapa depende de `window` (Leaflet) — nunca renderiza no servidor.
const LeafletMap = dynamic(() => import("@/components/map/leaflet-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-accent/40" />,
})

type Props = {
  points: MapPoint[]
  // Base do link de detalhe (mapa privado). Ausente = mapa público (popup sem link).
  linkBase?: string
  // Mapa privado: mostra a legenda de visibilidade (público vs. oculto) e o filtro de visibilidade.
  showVisibility?: boolean
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export function MapExplorer({ points, linkBase, showVisibility }: Props) {
  const t = useTranslations("map")
  const ta = useTranslations("animals")
  const locale = useLocale()

  const [species, setSpecies] = useState<string[]>([])
  const [pathogen, setPathogen] = useState<string[]>([])
  const [sex, setSex] = useState<string[]>([])
  const [lifeStage, setLifeStage] = useState<string[]>([])
  const [state, setState] = useState<string[]>([])
  const [research, setResearch] = useState<string[]>([])
  const [visibility, setVisibility] = useState(ALL)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  // Opções derivadas dos pontos carregados.
  const speciesOptions = useMemo<MultiSelectOption[]>(
    () => distinctSorted(points.map((p) => p.species), locale).map((s) => ({ value: s, label: s })),
    [points, locale]
  )
  const pathogenOptions = useMemo<MultiSelectOption[]>(
    () =>
      distinctSorted(points.flatMap((p) => p.positivePathogens), locale).map((p) => ({
        value: p,
        label: p,
      })),
    [points, locale]
  )
  const stateOptions = useMemo<MultiSelectOption[]>(
    () => distinctSorted(points.map((p) => p.state), locale).map((s) => ({ value: s, label: s })),
    [points, locale]
  )
  const researchOptions = useMemo<MultiSelectOption[]>(
    () =>
      distinctSorted(points.map((p) => p.researchName), locale).map((r) => ({
        value: r,
        label: r,
      })),
    [points, locale]
  )
  const sexOptions = useMemo<MultiSelectOption[]>(() => {
    const present = new Set(points.map((p) => p.sex))
    return SEX_OPTIONS.filter((o) => present.has(o.value)).map((o) => ({
      value: o.value,
      label: ta(o.key),
    }))
  }, [points, ta])
  const lifeStageOptions = useMemo<MultiSelectOption[]>(() => {
    const present = new Set(points.map((p) => p.lifeStage))
    return LIFE_STAGE_OPTIONS.filter((o) => present.has(o.value)).map((o) => ({
      value: o.value,
      label: ta(o.key),
    }))
  }, [points, ta])

  const filtered = useMemo(
    () =>
      points.filter((p) => {
        if (species.length && !species.includes(p.species)) return false
        if (pathogen.length && !pathogen.some((x) => p.positivePathogens.includes(x))) return false
        if (sex.length && !(p.sex && sex.includes(p.sex))) return false
        if (lifeStage.length && !(p.lifeStage && lifeStage.includes(p.lifeStage))) return false
        if (state.length && !(p.state && state.includes(p.state))) return false
        if (research.length && !(p.researchName && research.includes(p.researchName))) return false
        if (visibility === "public" && !p.isPublic) return false
        if (visibility === "hidden" && p.isPublic) return false
        if (from && (!p.eventDate || p.eventDate < from)) return false
        if (to && (!p.eventDate || p.eventDate > to)) return false
        return true
      }),
    [points, species, pathogen, sex, lifeStage, state, research, visibility, from, to]
  )

  const labels: PopupLabels = useMemo(
    () => ({
      date: t("popupDate"),
      location: t("popupLocation"),
      research: t("popupResearch"),
      positive: t("popupPositive"),
      noPositive: t("popupNoPositive"),
      viewDetails: t("popupViewDetails"),
      hidden: t("legendHidden"),
    }),
    [t]
  )

  const hasFilters =
    species.length > 0 ||
    pathogen.length > 0 ||
    sex.length > 0 ||
    lifeStage.length > 0 ||
    state.length > 0 ||
    research.length > 0 ||
    visibility !== ALL ||
    from !== "" ||
    to !== ""

  const clear = () => {
    setSpecies([])
    setPathogen([])
    setSex([])
    setLifeStage([])
    setState([])
    setResearch([])
    setVisibility(ALL)
    setFrom("")
    setTo("")
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3 shadow-sm">
        <Field label={t("filterSpecies")}>
          <div className="w-48">
            <MultiSelect
              options={speciesOptions}
              value={species}
              onChange={setSpecies}
              placeholder={t("allSpecies")}
              searchPlaceholder={t("filterSpecies")}
              emptyText={t("noOptions")}
            />
          </div>
        </Field>

        <Field label={t("filterPathogen")}>
          <div className="w-48">
            <MultiSelect
              options={pathogenOptions}
              value={pathogen}
              onChange={setPathogen}
              placeholder={t("allPathogens")}
              searchPlaceholder={t("filterPathogen")}
              emptyText={t("noOptions")}
            />
          </div>
        </Field>

        {sexOptions.length > 0 && (
          <Field label={t("filterSex")}>
            <div className="w-40">
              <MultiSelect
                options={sexOptions}
                value={sex}
                onChange={setSex}
                placeholder={t("allSexes")}
                emptyText={t("noOptions")}
                searchable={false}
              />
            </div>
          </Field>
        )}

        {lifeStageOptions.length > 0 && (
          <Field label={t("filterLifeStage")}>
            <div className="w-44">
              <MultiSelect
                options={lifeStageOptions}
                value={lifeStage}
                onChange={setLifeStage}
                placeholder={t("allLifeStages")}
                emptyText={t("noOptions")}
                searchable={false}
              />
            </div>
          </Field>
        )}

        {stateOptions.length > 0 && (
          <Field label={t("filterState")}>
            <div className="w-44">
              <MultiSelect
                options={stateOptions}
                value={state}
                onChange={setState}
                placeholder={t("allStates")}
                searchPlaceholder={t("filterState")}
                emptyText={t("noOptions")}
              />
            </div>
          </Field>
        )}

        {researchOptions.length > 1 && (
          <Field label={t("filterResearch")}>
            <div className="w-52">
              <MultiSelect
                options={researchOptions}
                value={research}
                onChange={setResearch}
                placeholder={t("allResearch")}
                searchPlaceholder={t("filterResearch")}
                emptyText={t("noOptions")}
              />
            </div>
          </Field>
        )}

        {showVisibility && (
          <Field label={t("filterVisibility")}>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allVisibility")}</SelectItem>
                <SelectItem value="public">{t("legendPublic")}</SelectItem>
                <SelectItem value="hidden">{t("legendHidden")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field label={t("filterFrom")}>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-40"
          />
        </Field>

        <Field label={t("filterTo")}>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-40"
          />
        </Field>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clear} className="gap-1">
            <X className="size-3.5" />
            {t("clear")}
          </Button>
        )}

        <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          {showVisibility && (
            <div className="hidden items-center gap-3 sm:flex">
              <span className="flex items-center gap-1.5">
                <Globe className="size-3.5" style={{ color: "#003366" }} />
                {t("legendPublic")}
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="size-3.5" style={{ color: "#B45309" }} />
                {t("legendHidden")}
              </span>
            </div>
          )}
          <span className="font-medium tabular-nums">
            {t("resultsCount", { count: filtered.length })}
          </span>
        </div>
      </div>

      {/* Mapa */}
      <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-lg border shadow-sm">
        {points.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <LeafletMap points={filtered} labels={labels} linkBase={linkBase} locale={locale} />
        )}
      </div>
    </div>
  )
}
