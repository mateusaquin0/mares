"use client"

// MARES — Explorador do mapa: barra de filtros (multisseleção) + mapa Leaflet.
// Os filtros são aplicados no cliente sobre os pontos já carregados; o mapa em si é montado
// por import dinâmico (ssr:false) por depender de `window`.

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { cn } from "@/lib/utils"
import { useTranslations, useLocale } from "next-intl"
import { ChevronDown, Download, Globe, Lock, SlidersHorizontal, X } from "lucide-react"

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
    a.localeCompare(b, locale),
  )
}

// Serializa uma matriz de células em CSV (RFC 4180): aspas quando há vírgula/aspas/quebra.
function toCsv(rows: string[][]): string {
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  // Texto livre começando com =, +, - ou @ seria executado como fórmula pela planilha.
  // Número (coordenada negativa) fica como está.
  const neutralize = (v: string) =>
    /^[=+\-@\t\r]/.test(v) && !Number.isFinite(Number(v)) ? `'${v}` : v
  return rows.map((r) => r.map((v) => esc(neutralize(v))).join(",")).join("\r\n")
}

// Dispara o download de um texto como arquivo (client-only).
function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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
  // Query anexada a esse link (ex.: a origem que o "voltar" do detalhe usa).
  linkQuery?: string
  // Mapa privado: mostra a legenda de visibilidade (público vs. oculto) e o filtro de visibilidade.
  showVisibility?: boolean
  // Título da tela, na mesma linha da contagem e da exportação.
  heading?: React.ReactNode
  // Mapa de ponta a ponta: anula a margem lateral de 24px da página.
  flush?: boolean
  // Mapa público: abaixo de 760px os filtros recolhem atrás do botão "Filtros" e o Exportar
  // vira só ícone, para o mapa ocupar a tela do celular.
  collapsibleFilters?: boolean
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="min-w-0" title={label}>
      <span className="sr-only">{label}</span>
      {children}
    </label>
  )
}

export function MapExplorer({
  points,
  linkBase,
  linkQuery,
  showVisibility,
  heading,
  flush,
  collapsibleFilters,
}: Props) {
  const t = useTranslations("map")
  const ta = useTranslations("animals")
  const locale = useLocale()

  const [filtersOpen, setFiltersOpen] = useState(false)
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
    () =>
      distinctSorted(
        points.map((p) => p.species),
        locale,
      ).map((s) => ({ value: s, label: s })),
    [points, locale],
  )
  const pathogenOptions = useMemo<MultiSelectOption[]>(
    () =>
      distinctSorted(
        points.flatMap((p) => p.positivePathogens),
        locale,
      ).map((p) => ({
        value: p,
        label: p,
      })),
    [points, locale],
  )
  const stateOptions = useMemo<MultiSelectOption[]>(
    () =>
      distinctSorted(
        points.map((p) => p.state),
        locale,
      ).map((s) => ({ value: s, label: s })),
    [points, locale],
  )
  const researchOptions = useMemo<MultiSelectOption[]>(
    () =>
      distinctSorted(
        points.map((p) => p.researchName),
        locale,
      ).map((r) => ({
        value: r,
        label: r,
      })),
    [points, locale],
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
        if (species.length && (p.species == null || !species.includes(p.species))) return false
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
    [points, species, pathogen, sex, lifeStage, state, research, visibility, from, to],
  )

  const labels: PopupLabels = useMemo(
    () => ({
      date: t("popupDate"),
      location: t("popupLocation"),
      research: t("popupResearch"),
      positive: t("popupPositive"),
      noPositive: t("popupNoPositive"),
      viewDetails: t("popupViewDetails"),
      unpublished: t("legendUnpublished"),
      undetermined: ta("speciesUndetermined"),
    }),
    [t, ta],
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

  // Exporta os pontos ATUALMENTE filtrados (todos, se não houver filtro) em CSV. Os dados já
  // estão no cliente (`filtered`), então não há chamada ao servidor — respeita exatamente o
  // que o usuário vê. `﻿` (BOM) faz o Excel abrir em UTF-8.
  const exportCsv = () => {
    const sexLabel = new Map<string, string>(SEX_OPTIONS.map((o) => [o.value, ta(o.key)]))
    const stageLabel = new Map<string, string>(LIFE_STAGE_OPTIONS.map((o) => [o.value, ta(o.key)]))
    const header = [
      t("csvControlId"),
      t("csvSpecies"),
      t("csvSex"),
      t("csvLifeStage"),
      t("csvMunicipality"),
      t("csvState"),
      t("csvBeach"),
      t("csvDate"),
      t("csvLat"),
      t("csvLon"),
      t("csvResearch"),
      t("csvPathogens"),
    ]
    const rows = filtered.map((p) => [
      p.controlId ?? "",
      p.species ?? ta("speciesUndetermined"),
      p.sex ? (sexLabel.get(p.sex) ?? p.sex) : "",
      p.lifeStage ? (stageLabel.get(p.lifeStage) ?? p.lifeStage) : "",
      p.municipality ?? "",
      p.state ?? "",
      p.beach ?? "",
      p.eventDate ?? "",
      p.lat != null ? String(p.lat) : "",
      p.lon != null ? String(p.lon) : "",
      p.researchName ?? "",
      p.positivePathogens.join("; "),
    ])
    const stamp = new Date().toISOString().slice(0, 10)
    downloadText(
      `MARES-mapa-${stamp}.csv`,
      "﻿" + toCsv([header, ...rows]),
      "text/csv;charset=utf-8",
    )
  }

  return (
    <div className="flex h-full flex-col" data-testid="map-explorer">
      <div
        className={cn(
          "flex flex-wrap items-baseline gap-x-3 gap-y-1",
          collapsibleFilters && !filtersOpen && "max-[759px]:pb-2",
        )}
      >
        {heading}
        {collapsibleFilters && (
          <Button
            variant="outline"
            className="h-11 self-center max-[759px]:order-1 min-[760px]:hidden"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <SlidersHorizontal className="size-4" />
            {t("filters")}
            <ChevronDown
              className={cn("size-4 transition-transform", filtersOpen && "rotate-180")}
            />
          </Button>
        )}
        <b
          className={cn(
            "whitespace-nowrap font-semibold tabular-nums",
            collapsibleFilters && "max-[759px]:basis-full max-[759px]:text-sm",
          )}
        >
          {t("resultsCount", { count: filtered.length })}
        </b>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "self-center",
            collapsibleFilters && "max-[759px]:order-1 max-[759px]:ml-auto max-[759px]:h-11",
          )}
          onClick={exportCsv}
          disabled={filtered.length === 0}
        >
          <Download className="size-4" />
          {t("exportCsv")}
        </Button>
      </div>
      <div
        className={cn(
          "mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-2 gap-y-1.5 pb-2",
          collapsibleFilters &&
            "max-[759px]:grid-cols-2 max-[759px]:[&_button]:h-11 max-[759px]:[&_input]:h-11",
          collapsibleFilters && !filtersOpen && "max-[759px]:hidden",
        )}
      >
        <Field label={t("filterSpecies")}>
          <div className="w-full">
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
          <div className="w-full">
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
            <div className="w-full">
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
            <div className="w-full">
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
            <div className="w-full">
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
            <div className="w-full">
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
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allVisibility")}</SelectItem>
                <SelectItem value="public">{t("legendPublic")}</SelectItem>
                <SelectItem value="hidden">{t("legendUnpublished")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field label={t("filterFrom")}>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full"
          />
        </Field>

        <Field label={t("filterTo")}>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full"
          />
        </Field>

        {hasFilters && (
          <button
            type="button"
            onClick={clear}
            className="flex h-[30px] items-center gap-1 text-[13px] text-primary underline underline-offset-2 hover:text-foreground"
          >
            <X className="size-3.5" />
            {t("clear")}
          </button>
        )}
      </div>

      <div
        className={cn(
          "relative min-h-[340px] flex-1 overflow-hidden border-t border-foreground",
          flush && "-mx-6",
        )}
      >
        <LeafletMap
          points={filtered}
          labels={labels}
          linkBase={linkBase}
          linkQuery={linkQuery}
          locale={locale}
        />
        {showVisibility && (
          <div className="absolute right-3 top-3 z-[800] flex gap-3.5 border border-foreground bg-popover px-2.5 py-1.5 text-[13px]">
            <span className="flex items-center gap-1.5">
              <Globe className="size-3.5" style={{ color: "#003366" }} />
              {t("legendPublic")}
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="size-3.5" style={{ color: "#B45309" }} />
              {t("legendUnpublished")}
            </span>
          </div>
        )}
        {filtered.length === 0 && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-[1000] -translate-x-1/2 border border-foreground bg-popover px-4 py-2 text-muted-foreground">
            {t("empty")}
          </div>
        )}
      </div>
    </div>
  )
}
