import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { getAuthUser, getActiveOrgId } from "@/lib/auth"
import { resolveDashboardAccess } from "@/lib/access-guards"
import { DashboardClient } from "@/app/app/(with-organization)/dashboard/dashboard-client"

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Filtros vindos do link. Só texto simples passa; datas fora do formato são ignoradas.
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? sp[k] : undefined)
  const date = (k: string) => {
    const v = one(k)
    return v && DATE_ONLY.test(v) ? v : undefined
  }
  const initial = {
    research: one("research"),
    pathogen: one("pathogen"),
    from: date("from"),
    to: date("to"),
  }

  const user = await getAuthUser()
  if (!user) redirect("/login")

  // Este é o funil: TODAS as outras telas de (with-organization) redirecionam para cá
  // quando não há organização ativa — inclusive quem perdeu o vínculo durante a navegação.
  // A regra está em src/lib/access-guards.ts, junto da do layout do grupo.
  const access = resolveDashboardAccess(user, await getActiveOrgId(user))
  if (access.kind === "redirect") redirect(access.to)
  const { activeOrg } = access

  const t = await getTranslations("dashboard")

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("greeting", { name: user.name ?? user.email })}{" "}
          {t("activeOrg", { org: activeOrg.orgName })}
        </p>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <DashboardClient initial={initial} />
    </div>
  )
}
