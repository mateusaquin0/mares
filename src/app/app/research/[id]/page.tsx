import { redirect, notFound } from "next/navigation"

import { prisma } from "@/lib/prisma"
import { getAuthUser, orgRole } from "@/lib/auth"
import { ResearchDetail } from "./research-detail"

export default async function ResearchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const research = await prisma.research.findUnique({
    where: { id },
    select: { orgId: true },
  })
  if (!research) notFound()

  // Só membros da organização da pesquisa acessam.
  const role = orgRole(user, research.orgId)
  if (!role) redirect("/app/research")

  return <ResearchDetail id={id} isOrgAdmin={role === "ORG_ADMIN"} selfId={user.id} />
}
