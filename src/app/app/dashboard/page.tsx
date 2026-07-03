import Link from "next/link"
import { redirect } from "next/navigation"
import { getTranslations, getLocale } from "next-intl/server"
import { Fish, FlaskConical, TestTubes, Activity, BarChart3, PieChart, ArrowRight } from "lucide-react"

import { prisma } from "@/lib/prisma"
import { getAuthUser, getActiveOrgId } from "@/lib/auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default async function DashboardPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const t = await getTranslations("dashboard")
  const locale = await getLocale()
  const activeOrgId = await getActiveOrgId(user)
  const activeOrg = user.memberships.find((m) => m.orgId === activeOrgId) ?? null

  const orgFilter = activeOrgId ? { research: { orgId: activeOrgId } } : undefined

  const [researchCount, animalCount, sampleCount, resultTotal, positiveTotal, recentAnimals] =
    await Promise.all([
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
    ])

  const positivity = resultTotal > 0 ? `${((positiveTotal / resultTotal) * 100).toFixed(1)}%` : "—"

  const stats = [
    { label: t("statAnimals"), value: animalCount, hint: t("hintRegistered"), icon: Fish },
    { label: t("statResearch"), value: researchCount, hint: t("hintActiveOrg"), icon: FlaskConical },
    { label: t("statSamples"), value: sampleCount, hint: t("hintSamples"), icon: TestTubes },
    { label: t("statPositivity"), value: positivity, hint: t("hintPositivity"), icon: Activity },
  ]

  const charts = [
    { title: t("chartSpeciesTitle"), icon: BarChart3 },
    { title: t("chartPositivityTitle"), icon: PieChart },
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

      {/* Gráficos (Fase 5) */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {charts.map((c) => {
          const Icon = c.icon
          return (
            <Card key={c.title}>
              <CardHeader>
                <CardTitle className="text-lg">{c.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground">
                  <Icon className="size-8 opacity-40" />
                  <p className="text-sm">{t("chartSoon")}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
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
