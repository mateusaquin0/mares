import { redirect } from "next/navigation"

import { getAuthUser, isAnyOrgAdmin } from "@/lib/auth"
import { isCatalogType } from "@/schemas/catalog.schema"
import { CatalogManager } from "./catalog-manager"

export default async function CatalogsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  // Admins de organização adicionam; admin global gerencia tudo; o criador edita/exclui
  // o próprio item enquanto não usado (a permissão por linha é resolvida no componente).
  if (!isAnyOrgAdmin(user)) redirect("/app/dashboard")

  const { tab } = await searchParams
  const initialType = tab && isCatalogType(tab) ? tab : "organs"

  return (
    <CatalogManager userId={user.id} isSystemAdmin={user.isSystemAdmin} initialType={initialType} />
  )
}
