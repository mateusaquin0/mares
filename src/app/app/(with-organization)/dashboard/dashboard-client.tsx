"use client"

// MARES — Conteúdo interativo do Dashboard (Fase 5): filtros globais (pesquisa e período),
// cartões de métricas, gráficos (espécies, positividade, linha do tempo) e heatmap geográfico.
// Os dados vêm de /api/dashboard (react-query); trocar um filtro refaz a busca.

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useTheme } from "next-themes"
import { useTranslations, useLocale } from "next-intl"
import { Fish, TestTubes, Microscope, Activity, Biohazard, X } from "lucide-react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  AreaChart,
  Area,
} from "recharts"

import { useDashboard } from "@/hooks/use-dashboard"
import { useResearchList } from "@/hooks/use-research"
import { usePathogens } from "@/hooks/use-catalog"
import { txt } from "@/lib/catalog-i18n"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"

const ALL = "__all__"
const SPECIES_COLORS = [
  "#003366",
  "#006876",
  "#43A047",
  "#0f6f8a",
  "#7a8794",
  "#B45309",
  "#8b5cf6",
  "#0ea5e9",
]
const NAVY = "#003366"
// inverse-primary do tema escuro (--primary do .dark em globals.css): azul claro legível
// sobre o fundo escuro. Usado na linha do tempo quando o tema é dark.
const PRIMARY_DARK = "#a7c8ff"

// Estilo do tooltip do recharts. Como `contentStyle`/`labelStyle`/`itemStyle` viram `style`
// inline (onde `var()` resolve), usamos os tokens do DS direto — adapta ao tema sozinho,
// sem depender do tema resolvido em JS. Antes o fundo era branco fixo (ilegível no dark).
const TOOLTIP_STYLE = {
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    color: "hsl(var(--popover-foreground))",
    boxShadow: "0 4px 12px rgb(0 0 0 / 0.15)",
    fontSize: 12,
  },
  labelStyle: { color: "hsl(var(--popover-foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--popover-foreground))" },
} as const

// Heatmap depende de `window` (Leaflet) — nunca renderiza no servidor.
const HeatMap = dynamic(() => import("@/components/map/heat-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-accent/40" />,
})

export function DashboardClient() {
  const t = useTranslations("dashboard")
  const locale = useLocale()
  const { resolvedTheme } = useTheme()
  const [research, setResearch] = useState(ALL)
  const [pathogen, setPathogen] = useState(ALL)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
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
  const pctFmt = (n: number) => `${n.toFixed(1).replace(".", ",")}%`
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

  // Recharts seta `stroke`/`fill` como atributos SVG, onde `var()` não resolve — por isso
  // estas cores são escolhidas em JS conforme o tema resolvido (equivalem aos tokens do DS).
  const isDark = resolvedTheme === "dark"
  // Linha do tempo: o navy do DS some no dark; usa o inverse-primary claro (#a7c8ff).
  const timelineColor = isDark ? PRIMARY_DARK : NAVY
  // Ticks dos eixos (muted-foreground) e linhas de grade (border), legíveis nos dois temas.
  const axisTick = isDark ? "#9ba7b5" : "#43474f"
  const gridStroke = isDark ? "#283443" : "#e2e8f0"

  const stats = [
    {
      id: "animals",
      label: t("statAnimals"),
      value: totals ? numberFmt.format(totals.animals) : "—",
      icon: Fish,
    },
    {
      id: "samples",
      label: t("statSamples"),
      value: totals ? numberFmt.format(totals.samples) : "—",
      icon: TestTubes,
    },
    {
      id: "tested",
      label: t("statTestedAnimals"),
      value: totals ? numberFmt.format(totals.testedAnimals) : "—",
      icon: Microscope,
    },
    {
      id: "positivity",
      label: t("statPositivity"),
      value: totals && posRate.denom > 0 ? pctFmt(posRate.value) : "—",
      icon: Activity,
    },
    {
      id: "positives",
      label: t("statPositives"),
      value: totals
        ? numberFmt.format(posMode === "sample" ? totals.positiveSamples : totals.positiveAnimals)
        : "—",
      icon: Biohazard,
    },
  ]

  const species = data?.species ?? []
  const positivity = data?.positivityByExam ?? []
  const timeline = data?.timeline ?? []
  const heat = data?.heat ?? []

  return (
    <div className={isLoading ? "opacity-60 transition-opacity" : "transition-opacity"}>
      {/* Filtros globais */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3 shadow-sm">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">
            {t("filterResearch")}
          </span>
          <Select value={research} onValueChange={setResearch}>
            <SelectTrigger className="w-56">
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
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">
            {t("filterPathogen")}
          </span>
          <div className="w-56">
            <Combobox
              options={pathogenOptions}
              value={pathogen}
              onChange={setPathogen}
              placeholder={t("allPathogens")}
              searchPlaceholder={t("searchPathogen")}
              emptyText={t("noPathogenFound")}
              loading={!pathogens}
            />
          </div>
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
            {t("clearFilters")}
          </Button>
        )}
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.id} className="transition-shadow hover:shadow-card-hover">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wide">
                  {s.label}
                </CardDescription>
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-4" />
                </span>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tracking-tight text-foreground">{s.value}</p>
                {(s.id === "positivity" || s.id === "positives") && (
                  <div
                    role="group"
                    aria-label={s.label}
                    className="mt-3 grid grid-cols-2 gap-0.5 rounded-md bg-secondary p-0.5"
                  >
                    {posModes.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setPosMode(m.key)}
                        aria-pressed={posMode === m.key}
                        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                          posMode === m.key
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Espécies + Positividade */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("chartSpeciesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {species.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {t("chartSpeciesEmpty")}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, species.length * 42)}>
                <BarChart layout="vertical" data={species} margin={{ left: 8, right: 24 }}>
                  <CartesianGrid horizontal={false} stroke={gridStroke} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: axisTick }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    tick={{ fontSize: 12, fontStyle: "italic", fill: axisTick }}
                  />
                  <Tooltip
                    formatter={(v) => [numberFmt.format(Number(v)), t("speciesCount")]}
                    cursor={{ fill: "hsl(var(--accent))" }}
                    contentStyle={TOOLTIP_STYLE.contentStyle}
                    labelStyle={TOOLTIP_STYLE.labelStyle}
                    itemStyle={TOOLTIP_STYLE.itemStyle}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {species.map((s, i) => (
                      <Cell key={s.name} fill={SPECIES_COLORS[i % SPECIES_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("chartPositivityTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {positivity.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {t("chartPositivityEmpty")}
              </p>
            ) : (
              <div className="flex flex-col gap-4 py-2">
                {positivity.map((r, i) => {
                  const color = SPECIES_COLORS[i % SPECIES_COLORS.length]
                  return (
                    <div key={r.label}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="truncate text-foreground" title={r.label}>
                          {r.label}
                        </span>
                        <span className="font-bold tabular-nums text-foreground">
                          {pctFmt(r.pct)}{" "}
                          <span className="font-normal text-muted-foreground">
                            ({numberFmt.format(r.positives)}/{numberFmt.format(r.total)})
                          </span>
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded bg-secondary">
                        <div
                          className="h-full rounded"
                          style={{ width: `${r.pct}%`, background: color }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Linha do tempo */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">{t("chartTimelineTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {t("chartTimelineEmpty")}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={timeline} margin={{ left: 0, right: 16, top: 8 }}>
                <defs>
                  <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={timelineColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={timelineColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={fmtMonth}
                  tick={{ fontSize: 12, fill: axisTick }}
                  minTickGap={16}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: axisTick }} width={32} />
                <Tooltip
                  labelFormatter={(m) => fmtMonth(String(m))}
                  formatter={(v) => [numberFmt.format(Number(v)), t("timelineCount")]}
                  cursor={{ stroke: timelineColor, strokeWidth: 1 }}
                  contentStyle={TOOLTIP_STYLE.contentStyle}
                  labelStyle={TOOLTIP_STYLE.labelStyle}
                  itemStyle={TOOLTIP_STYLE.itemStyle}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={timelineColor}
                  strokeWidth={2}
                  fill="url(#areaFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Heatmap geográfico */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">{t("heatmapTitle")}</CardTitle>
          <CardDescription>{t("heatmapDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[420px] overflow-hidden rounded-lg border">
            {heat.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                {t("heatmapEmpty")}
              </div>
            ) : (
              <HeatMap points={heat} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
