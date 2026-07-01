import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Logo } from "@/components/logo"
import { LocaleSwitcher } from "@/components/locale-switcher"

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("common")
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="absolute right-4 top-4 text-muted-foreground">
        <LocaleSwitcher />
      </div>
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" className="flex items-center gap-2 text-primary transition-opacity hover:opacity-80">
          <Logo className="size-9" />
          <span className="text-3xl font-bold tracking-tight">MARES</span>
        </Link>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("tagline")}</p>
      </div>
      {children}
    </div>
  )
}
