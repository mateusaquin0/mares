import { redirect } from "next/navigation"

import { getAuthUser, getActiveOrgId } from "@/lib/auth"
import { ResultsManager } from "./results-manager"

export default async function ResultsPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const orgId = await getActiveOrgId(user)
  if (!orgId) redirect("/app/dashboard")

  return <ResultsManager />
}
