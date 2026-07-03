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
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-foreground">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Logo className="size-5" />
          </span>
          MARES
        </Link>
        <div className="flex items-center gap-4">
          <LocaleSwitcher />
          <Link
            href="/login"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t("login")}
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("publicTitle")}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("publicSubtitle")}</p>
        </div>
        <div className="min-h-0 flex-1">
          <MapExplorer points={points} />
        </div>
      </div>
    </div>
  )
}
