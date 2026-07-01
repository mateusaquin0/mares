import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { prisma } from "@/lib/prisma"
import { getAuthUser, getActiveOrgId } from "@/lib/auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function DashboardPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const t = await getTranslations("dashboard")
  const activeOrgId = await getActiveOrgId(user)
  const activeOrg = user.memberships.find((m) => m.orgId === activeOrgId) ?? null

  const [organCount, pathogenCount, examTypeCount, orgResearchCount, animalCount] =
    await Promise.all([
      prisma.organ.count(),
      prisma.pathogen.count(),
      prisma.examType.count(),
      activeOrgId ? prisma.research.count({ where: { orgId: activeOrgId } }) : Promise.resolve(0),
      activeOrgId
        ? prisma.animal.count({ where: { research: { orgId: activeOrgId } } })
        : Promise.resolve(0),
    ])

  const stats = [
    { label: t("statResearch"), value: orgResearchCount, hint: t("hintActiveOrg") },
    { label: t("statAnimals"), value: animalCount, hint: t("hintRegistered") },
    { label: t("statOrgans"), value: organCount, hint: t("hintGlobal") },
    { label: t("statPathogens"), value: pathogenCount, hint: t("hintGlobal") },
    { label: t("statExams"), value: examTypeCount, hint: t("hintGlobal") },
  ]

  return (
    <div className="max-w-6xl px-8 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("greeting", { name: user.name ?? user.email })}{" "}
          {activeOrg ? t("activeOrg", { org: activeOrg.orgName }) : t("adminMode")}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg">{t("nextStepsTitle")}</CardTitle>
          <CardDescription>{t("nextStepsDesc")}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
