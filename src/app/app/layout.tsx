import { redirect } from "next/navigation"

import { getAuthUser, getActiveOrgId } from "@/lib/auth"
import { Sidebar } from "@/components/layout/sidebar"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const activeOrgId = await getActiveOrgId(user)
  const activeOrg = user.memberships.find((m) => m.orgId === activeOrgId) ?? null

  // Usuário sem organização e sem privilégio global: só a tela "sem organização"
  // é alcançável (o middleware bloqueia o resto). Renderiza sem a sidebar.
  if (!activeOrg && !user.isSystemAdmin) {
    return <main className="min-h-screen bg-background">{children}</main>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        userName={user.name ?? user.email}
        email={user.email}
        isSystemAdmin={user.isSystemAdmin}
        activeOrg={activeOrg}
        memberships={user.memberships}
      />
      <main className="flex-1 overflow-y-auto bg-background">{children}</main>
    </div>
  )
}
