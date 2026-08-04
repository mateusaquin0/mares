import { redirect } from "next/navigation"
import { getTranslations, getLocale } from "next-intl/server"

import { getAuthUser, getActiveOrgId } from "@/lib/auth"
import { getResearchScope } from "@/lib/research-access"
import { orgMapPoints } from "@/lib/map-points"
import { MapExplorer } from "@/components/map/map-explorer"

// Mapa privado da organização (Fase 4): todos os animais da org com coordenadas,
// inclusive os ocultos (destacados na legenda). Popup com link para o detalhe.
export default async function MapPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const t = await getTranslations("map")
  const locale = await getLocale()
  const orgId = await getActiveOrgId(user)
  // Escopo por pesquisa: admin vê todos os pontos da org; pesquisador só os das suas pesquisas.
  const scope = orgId ? await getResearchScope(user, orgId) : null
  const points = orgId
    ? await orgMapPoints(orgId, locale, scope && !scope.all ? scope.ids : undefined)
    : []

  return (
    <div className="flex h-full flex-col px-8 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <div className="min-h-0 flex-1">
        <MapExplorer points={points} linkBase="/app/animals" showVisibility />
      </div>
    </div>
  )
}
