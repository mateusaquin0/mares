import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { getAuthUser, getActiveOrgId } from "@/lib/auth"
import { DashboardClient } from "@/app/app/dashboard/dashboard-client"

export default async function DashboardPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const activeOrgId = await getActiveOrgId(user)
  // Admin global não participa de organizações → não tem dados no dashboard.
  // Sua tela inicial são as solicitações de acesso.
  if (user.isSystemAdmin && !activeOrgId) redirect("/app/admin/access-requests")

  const t = await getTranslations("dashboard")
  const activeOrg = user.memberships.find((m) => m.orgId === activeOrgId) ?? null

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("greeting", { name: user.name ?? user.email })}{" "}
          {activeOrg ? t("activeOrg", { org: activeOrg.orgName }) : t("adminMode")}
        </p>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <DashboardClient />
    </div>
  )
}
