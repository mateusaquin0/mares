import { redirect } from "next/navigation"

import { getAuthUser, getActiveOrgId, orgRole } from "@/lib/auth"
import { MembersManager } from "./members-manager"

export default async function MembersPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const activeOrgId = await getActiveOrgId(user)
  if (!activeOrgId) redirect("/app/dashboard")

  // Pesquisador vê a lista em modo leitura; só admin da org gerencia (o admin global não
  // participa de organizações). Ver docs/PERMISSOES.md.
  const role = orgRole(user, activeOrgId)
  if (!role) redirect("/app/dashboard")
  const canManage = role === "ORG_ADMIN"

  const activeOrg = user.memberships.find((m) => m.orgId === activeOrgId)

  return (
    <MembersManager
      orgId={activeOrgId}
      orgName={activeOrg?.orgName ?? ""}
      selfId={user.id}
      canManage={canManage}
    />
  )
}
