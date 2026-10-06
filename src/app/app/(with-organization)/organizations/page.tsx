import { redirect } from "next/navigation"

import { getAuthUser } from "@/lib/auth"
import { MyOrganizations } from "./my-organizations"

export default async function OrganizationsPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  if (user.memberships.length === 0) redirect("/app/dashboard")

  return <MyOrganizations selfId={user.id} memberships={user.memberships} />
}
