import { redirect } from "next/navigation"

import { getAuthUser, getActiveOrgId, orgRole } from "@/lib/auth"
import { ResearchManager } from "./research-manager"

export default async function ResearchPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const orgId = await getActiveOrgId(user)
  if (!orgId) redirect("/app/dashboard")

  const role = orgRole(user, orgId)
  return <ResearchManager isOrgAdmin={role === "ORG_ADMIN"} selfId={user.id} />
}
