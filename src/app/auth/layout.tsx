import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Logo } from "@/components/logo"
import { LocaleSwitcher } from "@/components/locale-switcher"

export default async function AuthFlowLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("authPanel")

  return (
    <div className="flex min-h-screen">
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex lg:w-[46%]"
        style={{
          background: "linear-gradient(160deg, #002147 0%, #003366 60%, #006876 140%)",
        }}
      >
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-white/10">
            <Logo className="size-6" />
          </span>
          <span className="text-2xl font-bold tracking-tight">MARES</span>
        </Link>

        <div className="max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">{t("brandTitle")}</h1>
          <p className="mt-4 text-base leading-relaxed text-white/80">{t("brandDesc")}</p>
        </div>

        <p className="text-sm text-white/55">{t("brandFooter")}</p>

        <Logo className="pointer-events-none absolute -bottom-20 -right-20 size-80 text-white/[0.06]" />
      </aside>

      <main className="relative flex flex-1 items-center justify-center bg-background px-6 py-12">
        <div className="absolute right-4 top-4 text-muted-foreground">
          <LocaleSwitcher />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  )
}
