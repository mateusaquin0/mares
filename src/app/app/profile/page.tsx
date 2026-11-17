import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { getAuthUser } from "@/lib/auth"
import { ProfileForm } from "./profile-form"

export default async function ProfilePage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const t = await getTranslations("profile")

  return (
    <div className="max-w-2xl space-y-4 px-page pb-8 pt-3.5">
      <div>
        <h1 className="font-serif text-[28px] font-medium leading-8">{t("title")}</h1>
        <p className="mt-0.5 max-w-[820px] text-pretty text-muted-foreground">{t("subtitle")}</p>
      </div>

      <ProfileForm name={user.name ?? ""} email={user.email} />
    </div>
  )
}
