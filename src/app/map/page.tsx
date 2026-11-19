import Link from "next/link"
import { getTranslations, getLocale } from "next-intl/server"

import { publicMapPoints } from "@/lib/map-points"
import { MapExplorer } from "@/components/map/map-explorer"
import { Logo } from "@/components/logo"
import { LocaleSwitcher } from "@/components/locale-switcher"

// Mapa público (Fase 4): acessível sem login (ver src/middleware / PUBLIC_PATHS).
// Mostra apenas dados públicos (animal.isPublic AND research.isPublic); o popup não
// linka para o detalhe (que exige autenticação).
export default async function PublicMapPage() {
  const t = await getTranslations("map")
  const locale = await getLocale()
  const points = await publicMapPoints(locale)

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center gap-x-3 border-b border-foreground px-6 py-1.5">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Logo className="size-6" />
          <span className="font-serif text-[22px] font-semibold tracking-[0.04em]">MARES</span>
        </Link>
        <div className="hidden min-w-0 flex-1 items-baseline gap-3 border-l border-border pl-3 min-[760px]:flex">
          <h1 className="shrink-0 font-serif text-xl font-medium">{t("publicTitle")}</h1>
          <span className="truncate text-sm text-muted-foreground">{t("publicSubtitle")}</span>
        </div>
        <span className="flex-1 min-[760px]:hidden" />
        <LocaleSwitcher />
        <Link
          href="/login"
          className="inline-flex h-11 shrink-0 items-center rounded-sm border border-foreground px-3 font-semibold transition-colors hover:bg-accent"
        >
          {t("login")}
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-6 pt-2">
        <MapExplorer
          points={points}
          flush
          collapsibleFilters
          heading={
            <div key="heading" className="basis-full min-[760px]:hidden">
              <h1 className="font-serif text-[22px] font-medium leading-7">{t("publicTitle")}</h1>
              <p className="text-pretty text-sm text-muted-foreground">{t("publicSubtitle")}</p>
            </div>
          }
        />
      </div>
    </div>
  )
}
