import { redirect } from "next/navigation"

import { getAuthUser, isAnyOrgAdmin } from "@/lib/auth"
import { CatalogManager } from "./catalog-manager"

export default async function CatalogsPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  // Admins de organização (para adicionar) e admin global (para editar/remover).
  if (!isAnyOrgAdmin(user)) redirect("/app/dashboard")

  return <CatalogManager canEdit={user.isSystemAdmin} />
}
