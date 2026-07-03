import { redirect } from "next/navigation"

import { getAuthUser, isAnyOrgAdmin } from "@/lib/auth"
import { CatalogManager } from "./catalog-manager"

export default async function CatalogsPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  // Admins de organização adicionam; admin global gerencia tudo; o criador edita/exclui
  // o próprio item enquanto não usado (a permissão por linha é resolvida no componente).
  if (!isAnyOrgAdmin(user)) redirect("/app/dashboard")

  return <CatalogManager userId={user.id} isSystemAdmin={user.isSystemAdmin} />
}
