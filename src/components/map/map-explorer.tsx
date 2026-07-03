"use client"

// MARES — Explorador do mapa (Fase 4): barra de filtros + mapa Leaflet.
// Os filtros (espécie, patógeno, período) são aplicados no cliente sobre os pontos já
// carregados; o mapa em si é montado por import dinâmico (ssr:false) por depender de `window`.

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useTranslations, useLocale } from "next-intl"
import { X } from "lucide-react"

import type { MapPoint } from "@/lib/map-points"
import type { PopupLabels } from "@/components/map/leaflet-map"
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

// O mapa depende de `window` (Leaflet) — nunca renderiza no servidor.
const LeafletMap = dynamic(() => import("@/components/map/leaflet-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-accent/40" />,
})

type Props = {
  points: MapPoint[]
  // Base do link de detalhe (mapa privado). Ausente = mapa público (popup sem link).
  linkBase?: string
  // Mapa privado: mostra a legenda de visibilidade (público vs. oculto).
  showVisibility?: boolean
}

export function MapExplorer({ points, linkBase, showVisibility }: Props) {
  const t = useTranslations("map")
  const locale = useLocale()
  const [species, setSpecies] = useState(ALL)
  const [pathogen, setPathogen] = useState(ALL)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const speciesOptions = useMemo(
    () => [...new Set(points.map((p) => p.species))].sort((a, b) => a.localeCompare(b, locale)),
    [points, locale]
  )
  const pathogenOptions = useMemo(
    () =>
      [...new Set(points.flatMap((p) => p.positivePathogens))].sort((a, b) =>
        a.localeCompare(b, locale)
      ),
    [points, locale]
  )

  const filtered = useMemo(
    () =>
      points.filter((p) => {
        if (species !== ALL && p.species !== species) return false
        if (pathogen !== ALL && !p.positivePathogens.includes(pathogen)) return false
        if (from && (!p.eventDate || p.eventDate < from)) return false
        if (to && (!p.eventDate || p.eventDate > to)) return false
        return true
      }),
    [points, species, pathogen, from, to]
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

  const hasFilters = species !== ALL || pathogen !== ALL || from !== "" || to !== ""
  const clear = () => {
    setSpecies(ALL)
    setPathogen(ALL)
    setFrom("")
    setTo("")
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3 shadow-sm">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">
            {t("filterSpecies")}
          </span>
          <Select value={species} onValueChange={setSpecies}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allSpecies")}</SelectItem>
              {speciesOptions.map((s) => (
                <SelectItem key={s} value={s} className="italic">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">
            {t("filterPathogen")}
          </span>
          <Select value={pathogen} onValueChange={setPathogen}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allPathogens")}</SelectItem>
              {pathogenOptions.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">
            {t("filterFrom")}
          </span>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-40"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">
            {t("filterTo")}
          </span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-40"
          />
        </label>

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
                <span className="size-2.5 rounded-full" style={{ background: "#003366" }} />
                {t("legendPublic")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: "#B45309" }} />
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
