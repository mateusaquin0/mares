import { redirect } from "next/navigation"

import { getAuthUser, getActiveOrgId, orgRole } from "@/lib/auth"
import { AnimalsManager } from "./animals-manager"

export default async function AnimalsPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const orgId = await getActiveOrgId(user)
  if (!orgId) redirect("/app/dashboard")

  const role = orgRole(user, orgId)
  return <AnimalsManager isOrgAdmin={role === "ORG_ADMIN"} />
}
