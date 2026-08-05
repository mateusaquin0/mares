import { redirect, notFound } from "next/navigation"

import { prisma } from "@/lib/prisma"
import { getAuthUser, orgRole } from "@/lib/auth"
import { AnimalDetail } from "./animal-detail"

export default async function AnimalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const animal = await prisma.animal.findUnique({
    where: { id },
    select: { research: { select: { orgId: true } } },
  })
  if (!animal) notFound()

  // Só membros da organização (dona da pesquisa do animal) acessam.
  const role = orgRole(user, animal.research.orgId)
  if (!role) redirect("/app/animals")

  return <AnimalDetail id={id} isOrgAdmin={role === "ORG_ADMIN"} selfId={user.id} />
}
