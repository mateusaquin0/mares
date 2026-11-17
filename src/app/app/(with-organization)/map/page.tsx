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
    // O mapa usa a largura inteira da janela, sem o limite de 1280px das outras telas.
    <div className="flex h-full min-h-[600px] flex-col px-6 pt-2">
      <MapExplorer
        points={points}
        linkBase="/app/animals"
        linkQuery="from=map"
        showVisibility
        flush
        heading={
          <>
            <h1 className="font-serif text-[26px] font-medium leading-[30px]">{t("title")}</h1>
            <span className="min-w-0 flex-[1_1_300px] text-muted-foreground">{t("subtitle")}</span>
          </>
        }
      />
    </div>
  )
}
