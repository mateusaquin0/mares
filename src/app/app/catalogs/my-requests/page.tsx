import { redirect } from "next/navigation"

import { getAuthUser } from "@/lib/auth"
import { MyRequests } from "./my-requests"

// Solicitações de glossário do próprio usuário (acompanhar status / motivo da rejeição).
export default async function MyCatalogRequestsPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  return <MyRequests />
}
