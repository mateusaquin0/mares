"use client"

// MARES — Conteúdo interativo do Dashboard (Fase 5): filtros globais (pesquisa e período),
// faixa de indicadores, barras (espécies, positividade, linha do tempo) e mapa de calor.
// Os dados vêm de /api/dashboard (react-query); trocar um filtro refaz a busca.

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useTranslations, useLocale } from "next-intl"
import { X } from "lucide-react"

import { useDashboard } from "@/hooks/use-dashboard"
import { useResearchList } from "@/hooks/use-research"
import { usePathogens } from "@/hooks/use-catalog"
import { txt } from "@/lib/catalog-i18n"
import { cn } from "@/lib/utils"
import { SectionTitle } from "@/components/ui/section"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"
import { EmptyState } from "@/components/ui/empty-state"

const ALL = "__all__"

// Heatmap depende de `window` (Leaflet) — nunca renderiza no servidor.
const HeatMap = dynamic(() => import("@/components/map/heat-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-accent/40" />,
})

export type DashboardFilterParams = {
  research?: string
  pathogen?: string
  from?: string
  to?: string
}

// `heading`: título e saudação, montados no servidor; os filtros ficam ao lado deles.
export function DashboardClient({
  initial,
  heading,
}: {
  initial?: DashboardFilterParams
  heading: React.ReactNode
}) {
  const t = useTranslations("dashboard")
  const locale = useLocale()
  const [research, setResearch] = useState(initial?.research ?? ALL)
  const [pathogen, setPathogen] = useState(initial?.pathogen ?? ALL)
  const [from, setFrom] = useState(initial?.from ?? "")
  const [to, setTo] = useState(initial?.to ?? "")

  // Os filtros ficam na URL para que uma visão filtrada possa ser compartilhada por link
  // e sobreviva a um recarregamento. `replaceState` troca o endereço sem nova navegação.
  useEffect(() => {
    const params = new URLSearchParams()
    if (research !== ALL) params.set("research", research)
    if (pathogen !== ALL) params.set("pathogen", pathogen)
    if (from) params.set("from", from)
    if (to) params.set("to", to)
    const qs = params.toString()
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next)
    }
  }, [research, pathogen, from, to])
  // Modo de cálculo da taxa de positividade (A2). Estado local, sem persistência.
  const [posMode, setPosMode] = useState<"animal" | "sample">("animal")

  const filters = useMemo(
    () => ({
      researchId: research === ALL ? undefined : research,
      pathogenId: pathogen === ALL ? undefined : pathogen,
      from: from || undefined,
      to: to || undefined,
    }),
    [research, pathogen, from, to],
  )
  const { data, isLoading } = useDashboard(filters)
  const { data: researches } = useResearchList()
  const { data: pathogens } = usePathogens()

  // Opções de patógeno do autocomplete: "todos" + patógenos ordenados pelo rótulo exibido
  // (nome científico ou nome do catálogo).
  const pathogenOptions = useMemo(() => {
    const items = (pathogens ?? [])
      .map((p) => ({ value: p.id, label: p.scientificName ?? txt(locale, p.name) }))
      .sort((a, b) => a.label.localeCompare(b.label, locale))
    return [{ value: ALL, label: t("allPathogens") }, ...items]
  }, [pathogens, locale, t])

  const hasFilters = research !== ALL || pathogen !== ALL || from !== "" || to !== ""
  const clear = () => {
    setResearch(ALL)
    setPathogen(ALL)
    setFrom("")
    setTo("")
  }

  const numberFmt = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }),
    [locale],
  )
  const pctNumberFmt = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale],
  )
  const pctFmt = (n: number) => `${pctNumberFmt.format(n)}%`
  const fmtMonth = (m: string) => monthFmt.format(new Date(`${m}-01T12:00:00Z`))

  const totals = data?.totals

  // Taxa de positividade conforme o modo escolhido (por animal / por amostra).
  // Cada modo tem seu próprio denominador; sem denominador (> 0) o valor é "—".
  const posModes = [
    { key: "animal", label: t("positivityByAnimal") },
    { key: "sample", label: t("positivityBySample") },
  ] as const
  const posRate =
    posMode === "sample"
      ? { value: totals?.positivityBySample ?? 0, denom: totals?.testedSamples ?? 0 }
      : { value: totals?.positivityByAnimal ?? 0, denom: totals?.testedAnimals ?? 0 }

  const stats = [
    {
      id: "animals",
      label: t("statAnimals"),
      value: totals ? numberFmt.format(totals.animals) : "—",
    },
    {
      id: "samples",
      label: t("statSamples"),
      value: totals ? numberFmt.format(totals.samples) : "—",
    },
    {
      id: "tested",
      label: t("statTestedAnimals"),
      value: totals ? numberFmt.format(totals.testedAnimals) : "—",
    },
  ]
  const positivityValue = totals && posRate.denom > 0 ? pctFmt(posRate.value) : "—"
  const positivesValue = totals
    ? numberFmt.format(posMode === "sample" ? totals.positiveSamples : totals.positiveAnimals)
    : "—"

  const species = data?.species ?? []
  const positivity = data?.positivityByExam ?? []
  const timeline = data?.timeline ?? []
  const heat = data?.heat ?? []
  const maxSpecies = Math.max(1, ...species.map((s) => s.count))
  const maxMonth = Math.max(1, ...timeline.map((m) => m.count))

  const filterLabel = "text-xs font-semibold text-muted-foreground"
  const statLabel = "text-xs font-bold uppercase tracking-[.05em] text-muted-foreground"
  const statValue = "font-serif text-[40px] font-medium leading-[44px] tabular-nums lining-nums"
  const sectionNote = "font-sans text-xs font-bold uppercase tracking-[.05em] text-muted-foreground"

  return (
    <div className={isLoading ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <div className="flex flex-wrap items-end gap-3 pb-3.5">
        <div className="min-w-0 flex-[1_1_360px]">{heading}</div>
        <label className="grid w-[200px] gap-0.5">
          <span className={filterLabel}>{t("filterResearch")}</span>
          <Select value={research} onValueChange={setResearch}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allResearch")}</SelectItem>
              {(researches ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid w-[200px] gap-0.5">
          <span className={filterLabel}>{t("filterPathogen")}</span>
          <Combobox
            options={pathogenOptions}
            value={pathogen}
            onChange={setPathogen}
            placeholder={t("allPathogens")}
            searchPlaceholder={t("searchPathogen")}
            emptyText={t("noPathogenFound")}
            loading={!pathogens}
          />
        </label>
        <label className="grid w-[136px] gap-0.5">
          <span className={filterLabel}>{t("filterFrom")}</span>
          <Input type="date" name="from" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="grid w-[136px] gap-0.5">
          <span className={filterLabel}>{t("filterTo")}</span>
          <Input type="date" name="to" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={clear}
            className="flex h-[30px] items-center gap-1 text-[13px] text-primary underline underline-offset-2 hover:text-foreground"
          >
            <X className="size-3.5" />
            {t("clearFilters")}
          </button>
        )}
      </div>

      {/* Indicadores numa faixa só; a positividade divide a última célula com a base do
          cálculo (por animal / por amostra). */}
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,2.2fr)] border-b border-t-2 border-b-foreground border-t-foreground">
        {stats.map((s, i) => (
          <div
            key={s.id}
            className={cn("border-r border-border pb-3 pt-2.5", i === 0 ? "pr-4" : "px-4")}
          >
            <div className={statLabel}>{s.label}</div>
            <div className={statValue}>{s.value}</div>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-x-4 pb-3 pl-4 pt-2.5">
          <div>
            <div className={statLabel}>{t("statPositivity")}</div>
            <div className={statValue}>{positivityValue}</div>
          </div>
          <div>
            <div className={statLabel}>{t("statPositives")}</div>
            <div className={statValue}>
              {positivesValue}
              {totals && (
                <span className="ml-1.5 font-sans text-sm font-normal text-muted-foreground">
                  {t("ofTotal", { total: numberFmt.format(posRate.denom) })}
                </span>
              )}
            </div>
          </div>
          <div
            role="group"
            aria-label={t("positivityBase")}
            className="mb-2 flex rounded-sm border border-input text-[13px]"
          >
            {posModes.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setPosMode(m.key)}
                aria-pressed={posMode === m.key}
                className={cn(
                  "h-[26px] px-2.5 first:border-r first:border-input",
                  posMode === m.key
                    ? "bg-accent font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-[18px] grid grid-cols-2 gap-x-10 gap-y-[18px]">
        <section>
          <SectionTitle className="mb-1 justify-between">
            {t("chartSpeciesTitle")}
            <span className={sectionNote}>{t("speciesCount")}</span>
          </SectionTitle>
          {species.length === 0 ? (
            <EmptyState bordered={false} title={t("chartSpeciesEmpty")} />
          ) : (
            <ul data-chart="species">
              {species.map((s) => (
                <li
                  key={s.name}
                  className="grid h-6 grid-cols-[190px_minmax(0,1fr)_44px] items-center gap-3 border-b border-border"
                >
                  <span className="truncate font-serif text-[15px] italic" title={s.name}>
                    {s.name}
                  </span>
                  <span className="h-2.5">
                    <span
                      className="block h-full bg-chart-1"
                      style={{ width: `${(s.count / maxSpecies) * 100}%` }}
                    />
                  </span>
                  <span className="text-right font-semibold tabular-nums">
                    {numberFmt.format(s.count)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle className="mb-1 justify-between">
            {t("chartPositivityTitle")}
            <span className={sectionNote}>{t("positivityColumns")}</span>
          </SectionTitle>
          {positivity.length === 0 ? (
            <EmptyState bordered={false} title={t("chartPositivityEmpty")} />
          ) : (
            <ul>
              {positivity.map((r) => (
                <li
                  key={r.label}
                  className="grid h-8 grid-cols-[190px_minmax(0,1fr)_56px_72px] items-center gap-3 border-b border-border"
                >
                  <span className="truncate" title={r.label}>
                    {r.label}
                  </span>
                  <span className="h-2.5 bg-muted">
                    <span className="block h-full bg-chart-1" style={{ width: `${r.pct}%` }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{pctFmt(r.pct)}</span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    ({numberFmt.format(r.positives)}/{numberFmt.format(r.total)})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex min-h-[260px] flex-col">
          <SectionTitle className="justify-between">
            {t("chartTimelineTitle")}
            <span className={sectionNote}>{t("timelineCount")}</span>
          </SectionTitle>
          {timeline.length === 0 ? (
            <EmptyState bordered={false} title={t("chartTimelineEmpty")} />
          ) : (
            <>
              <div
                data-chart="timeline"
                className="flex min-h-[200px] flex-1 items-stretch gap-1.5 border-b border-foreground pt-[22px]"
              >
                {timeline.map((m) => (
                  <div
                    key={m.month}
                    className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5"
                    title={`${fmtMonth(m.month)}: ${numberFmt.format(m.count)}`}
                  >
                    {timeline.length <= 18 && (
                      <span className="text-xs font-semibold tabular-nums">
                        {numberFmt.format(m.count)}
                      </span>
                    )}
                    <span
                      className="block w-full bg-chart-1"
                      style={{ height: `${(m.count / maxMonth) * 100}%`, minHeight: 1 }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 pt-1 text-xs text-muted-foreground">
                {timeline.map((m, i) => (
                  <span key={m.month} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
                    {/* Com muitos meses, só um rótulo a cada três para não encavalar. */}
                    {timeline.length <= 18 || i % 3 === 0 ? fmtMonth(m.month) : ""}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="flex min-h-[320px] flex-col">
          <SectionTitle>
            {t("heatmapTitle")}
            <span className="font-sans text-sm font-normal text-muted-foreground">
              — {t("heatmapDesc")}
            </span>
          </SectionTitle>
          <div className="relative mt-2 min-h-[280px] flex-1 overflow-hidden border border-border">
            {heat.length === 0 ? (
              <EmptyState bordered={false} className="px-3" title={t("heatmapEmpty")} />
            ) : (
              <HeatMap points={heat} />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
