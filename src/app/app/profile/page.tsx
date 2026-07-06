import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { getAuthUser } from "@/lib/auth"
import { ProfileForm } from "./profile-form"

export default async function ProfilePage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const t = await getTranslations("profile")

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <ProfileForm name={user.name ?? ""} email={user.email} />
    </div>
  )
}
