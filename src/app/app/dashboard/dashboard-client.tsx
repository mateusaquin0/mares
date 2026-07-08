"use client"

// MARES — Conteúdo interativo do Dashboard (Fase 5): filtros globais (pesquisa e período),
// cartões de métricas, gráficos (espécies, positividade, linha do tempo) e heatmap geográfico.
// Os dados vêm de /api/dashboard (react-query); trocar um filtro refaz a busca.

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useTranslations, useLocale } from "next-intl"
import { Fish, TestTubes, Activity, Biohazard, X } from "lucide-react"
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
const TEAL = "#006876"

// Heatmap depende de `window` (Leaflet) — nunca renderiza no servidor.
const HeatMap = dynamic(() => import("@/components/map/heat-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-accent/40" />,
})

export function DashboardClient() {
  const t = useTranslations("dashboard")
  const locale = useLocale()
  const [research, setResearch] = useState(ALL)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const filters = useMemo(
    () => ({
      researchId: research === ALL ? undefined : research,
      from: from || undefined,
      to: to || undefined,
    }),
    [research, from, to],
  )
  const { data, isLoading } = useDashboard(filters)
  const { data: researches } = useResearchList()

  const hasFilters = research !== ALL || from !== "" || to !== ""
  const clear = () => {
    setResearch(ALL)
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
  const stats = [
    { label: t("statAnimals"), value: totals ? numberFmt.format(totals.animals) : "—", icon: Fish },
    {
      label: t("statSamples"),
      value: totals ? numberFmt.format(totals.samples) : "—",
      icon: TestTubes,
    },
    {
      label: t("statPositivity"),
      value: totals && totals.analyses > 0 ? pctFmt(totals.positivity) : "—",
      icon: Activity,
    },
    {
      label: t("statPositives"),
      value: totals ? numberFmt.format(totals.positive) : "—",
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="transition-shadow hover:shadow-card-hover">
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
                  <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    tick={{ fontSize: 12, fontStyle: "italic" }}
                  />
                  <Tooltip
                    formatter={(v) => numberFmt.format(Number(v))}
                    cursor={{ fill: "#f1f5f9" }}
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
                        <span className="font-bold tabular-nums" style={{ color }}>
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
                    <stop offset="0%" stopColor={TEAL} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={TEAL} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={fmtMonth}
                  tick={{ fontSize: 12 }}
                  minTickGap={16}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={32} />
                <Tooltip
                  labelFormatter={(m) => fmtMonth(String(m))}
                  formatter={(v) => [numberFmt.format(Number(v)), t("timelineCount")]}
                  cursor={{ stroke: NAVY, strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={NAVY}
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
