import Link from "next/link"
import { redirect } from "next/navigation"
import { getTranslations, getLocale } from "next-intl/server"
import { Fish, FlaskConical, TestTubes, Activity, ArrowRight } from "lucide-react"

import { prisma } from "@/lib/prisma"
import { getAuthUser, getActiveOrgId } from "@/lib/auth"
import { txt, type I18nText } from "@/lib/catalog-i18n"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// Paleta das barras de espécies (navy → cyan → bio → tons de apoio), ver design.md.
const SPECIES_COLORS = ["#003366", "#006876", "#43A047", "#0f6f8a", "#7a8794", "#B45309"]
const POSITIVITY_COLORS = ["#003366", "#006876", "#B45309", "#43A047"]

export default async function DashboardPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const t = await getTranslations("dashboard")
  const locale = await getLocale()
  const activeOrgId = await getActiveOrgId(user)
  const activeOrg = user.memberships.find((m) => m.orgId === activeOrgId) ?? null

  const orgFilter = activeOrgId ? { research: { orgId: activeOrgId } } : undefined

  const [
    researchCount,
    animalCount,
    sampleCount,
    resultTotal,
    positiveTotal,
    recentAnimals,
    speciesGroups,
    examTotalsRaw,
    examPositivesRaw,
  ] = await Promise.all([
    activeOrgId ? prisma.research.count({ where: { orgId: activeOrgId } }) : Promise.resolve(0),
    orgFilter ? prisma.animal.count({ where: orgFilter }) : Promise.resolve(0),
    activeOrgId
      ? prisma.sample.count({ where: { animal: { research: { orgId: activeOrgId } } } })
      : Promise.resolve(0),
    activeOrgId
      ? prisma.analysis.count({
          where: { result: { not: null }, sample: { animal: { research: { orgId: activeOrgId } } } },
        })
      : Promise.resolve(0),
    activeOrgId
      ? prisma.analysis.count({
          where: { result: "POSITIVO", sample: { animal: { research: { orgId: activeOrgId } } } },
        })
      : Promise.resolve(0),
    activeOrgId
      ? prisma.animal.findMany({
          where: orgFilter,
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            controlId: true,
            species: true,
            municipality: true,
            state: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    activeOrgId
      ? prisma.animal.groupBy({
          by: ["species"],
          where: orgFilter,
          _count: { _all: true },
          orderBy: { _count: { species: "desc" } },
          take: 6,
        })
      : Promise.resolve([]),
    activeOrgId
      ? prisma.analysis.groupBy({
          by: ["examTypeId"],
          where: { result: { not: null }, sample: { animal: { research: { orgId: activeOrgId } } } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    activeOrgId
      ? prisma.analysis.groupBy({
          by: ["examTypeId"],
          where: { result: "POSITIVO", sample: { animal: { research: { orgId: activeOrgId } } } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ])

  const positivity = resultTotal > 0 ? `${((positiveTotal / resultTotal) * 100).toFixed(1)}%` : "—"

  // Espécies mais registradas (barras horizontais).
  const speciesRows = speciesGroups.map((s) => ({ name: s.species, n: s._count._all }))
  const maxSpecies = Math.max(1, ...speciesRows.map((s) => s.n))

  // Positividade por exame: top exames com resultado, % de positivos.
  const positivesById = new Map(examPositivesRaw.map((e) => [e.examTypeId, e._count._all]))
  const examStats = examTotalsRaw
    .map((e) => ({
      id: e.examTypeId,
      total: e._count._all,
      positives: positivesById.get(e.examTypeId) ?? 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 4)
  const examTypes = examStats.length
    ? await prisma.examType.findMany({
        where: { id: { in: examStats.map((e) => e.id) } },
        select: { id: true, name: true },
      })
    : []
  const examNameById = new Map(examTypes.map((e) => [e.id, e.name as I18nText]))
  const positivityRows = examStats.map((e) => ({
    label: txt(locale, examNameById.get(e.id)),
    pct: e.total > 0 ? (e.positives / e.total) * 100 : 0,
  }))

  const pctFmt = (n: number) => `${n.toFixed(1).replace(".", ",")}%`

  const stats = [
    { label: t("statAnimals"), value: animalCount, hint: t("hintRegistered"), icon: Fish },
    { label: t("statResearch"), value: researchCount, hint: t("hintActiveOrg"), icon: FlaskConical },
    { label: t("statSamples"), value: sampleCount, hint: t("hintSamples"), icon: TestTubes },
    { label: t("statPositivity"), value: positivity, hint: t("hintPositivity"), icon: Activity },
  ]

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" })

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("greeting", { name: user.name ?? user.email })}{" "}
          {activeOrg ? t("activeOrg", { org: activeOrg.orgName }) : t("adminMode")}
        </p>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

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
                <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Gráficos */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("chartSpeciesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {speciesRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t("chartSpeciesEmpty")}
              </p>
            ) : (
              <div className="flex flex-col gap-3.5">
                {speciesRows.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <span
                      className="w-40 shrink-0 truncate text-sm italic text-foreground sm:w-48"
                      title={s.name}
                    >
                      {s.name}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-accent/40">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${(s.n / maxSpecies) * 100}%`,
                          background: SPECIES_COLORS[i % SPECIES_COLORS.length],
                        }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-muted-foreground">
                      {s.n}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("chartPositivityTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {positivityRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t("chartPositivityEmpty")}
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {positivityRows.map((r, i) => {
                  const color = POSITIVITY_COLORS[i % POSITIVITY_COLORS.length]
                  return (
                    <div key={r.label}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="truncate text-foreground" title={r.label}>
                          {r.label}
                        </span>
                        <span className="font-bold" style={{ color }}>
                          {pctFmt(r.pct)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded bg-secondary">
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

      {/* Atividades recentes */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">{t("recentTitle")}</CardTitle>
          <Link
            href="/app/animals"
            className="flex items-center gap-1 text-sm font-medium text-accent-foreground hover:underline"
          >
            {t("recentSeeAll")}
            <ArrowRight className="size-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {recentAnimals.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("recentEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-accent-foreground/80">
                    <th className="px-3 py-2">{t("thControl")}</th>
                    <th className="px-3 py-2">{t("thSpecies")}</th>
                    <th className="px-3 py-2">{t("thLocation")}</th>
                    <th className="px-3 py-2">{t("thDate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAnimals.map((a) => {
                    const location = [a.municipality, a.state].filter(Boolean).join(", ") || "—"
                    return (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-accent/30">
                        <td className="px-3 py-3">
                          <Link
                            href={`/app/animals/${a.id}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {a.controlId ?? "—"}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="secondary" className="font-normal italic">
                            {a.species}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{location}</td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {dateFmt.format(a.createdAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
