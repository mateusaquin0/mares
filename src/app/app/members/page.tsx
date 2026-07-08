import { redirect } from "next/navigation"

import { getAuthUser, getActiveOrgId, orgRole } from "@/lib/auth"
import { MembersManager } from "./members-manager"

export default async function MembersPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const activeOrgId = await getActiveOrgId(user)
  if (!activeOrgId) redirect("/app/dashboard")

  // Somente administradores da organização gerenciam membros (o admin global não participa).
  const role = orgRole(user, activeOrgId)
  if (role !== "ORG_ADMIN") redirect("/app/dashboard")

  const activeOrg = user.memberships.find((m) => m.orgId === activeOrgId)

  return <MembersManager orgId={activeOrgId} orgName={activeOrg?.orgName ?? ""} selfId={user.id} />
}
