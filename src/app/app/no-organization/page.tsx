import { getTranslations } from "next-intl/server"

import { Logo } from "@/components/logo"
import { SignOutButton } from "@/components/layout/sign-out-button"

export default async function NoOrganizationPage() {
  const t = await getTranslations("noOrg")
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-11 flex-none items-center gap-2 border-b border-foreground px-6">
        <Logo className="size-[22px]" />
        <span className="font-serif text-xl font-semibold tracking-[.04em]">MARES</span>
      </header>
      <div className="flex flex-1 flex-col justify-center px-[max(24px,calc(50%-300px))] py-6 text-base">
        <h1 className="text-balance font-serif text-[34px] font-medium leading-[38px]">
          {t("title")}
        </h1>
        <p className="mt-3 text-pretty">{t("description")}</p>
        <div className="mt-5 flex gap-2">
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
