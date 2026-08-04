import { redirect } from "next/navigation"

import { getAuthUser, canReviewCatalogRequest } from "@/lib/auth"
import { RequestsReview } from "./requests-review"

// Fila de curadoria do glossário. Acessível a qualquer admin de grupo OU admin global
// (fila única — ver docs/GLOSSARIO_SOLICITACOES.md). Não fica sob /app/admin porque
// admins de grupo (não globais) também revisam.
export default async function CatalogRequestsPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  if (!canReviewCatalogRequest(user)) redirect("/app/catalogs")

  return <RequestsReview isSystemAdmin={user.isSystemAdmin} />
}
