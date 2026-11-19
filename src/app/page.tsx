import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowRight, Database, Map, MapPinned, NotebookPen } from "lucide-react"

import { getAuthUser } from "@/lib/auth"
import { Logo } from "@/components/logo"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { ThemeToggle } from "@/components/theme-toggle"

// Recuo lateral das páginas públicas: 16px no celular, coluna de 1200px no desktop.
const GUTTER = "px-[max(16px,calc(50%-600px))]"

// Landing pública ("/"): apresenta o MARES e dá acesso direto ao mapa público (sem login).
// O middleware trata "/" como rota pública. Se houver sessão, o botão do topo leva ao painel.
export default async function Home() {
  const t = await getTranslations("landing")
  const user = await getAuthUser()
  const authHref = user ? "/app/dashboard" : "/login"
  const authLabel = user ? t("goToApp") : t("signIn")

  const features = [
    { icon: MapPinned, title: t("featureMapTitle"), desc: t("featureMapDesc"), map: true },
    { icon: NotebookPen, title: t("featureRecordTitle"), desc: t("featureRecordDesc") },
    { icon: Database, title: t("featureOpenTitle"), desc: t("featureOpenDesc") },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background text-base text-foreground">
      <header className={`flex items-center gap-1 border-b border-foreground py-2.5 ${GUTTER}`}>
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-2">
          <Logo className="size-6 shrink-0" />
          <span className="truncate font-serif text-[22px] font-semibold tracking-[0.04em]">
            MARES
          </span>
        </Link>
        <LocaleSwitcher />
        <ThemeToggle />
        <Link
          href={authHref}
          className="inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-sm border border-foreground px-3 font-semibold transition-colors hover:bg-accent"
        >
          {user ? (
            <>
              <span className="min-[760px]:hidden">{t("goToAppShort")}</span>
              <span className="max-[759px]:hidden">{authLabel}</span>
            </>
          ) : (
            authLabel
          )}
        </Link>
      </header>

      <section className={`py-[clamp(28px,6vw,72px)] ${GUTTER}`}>
        <p className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          {t("eyebrow")}
        </p>
        <h1 className="mt-2.5 max-w-[760px] text-balance font-serif text-[clamp(32px,5vw,56px)] font-medium leading-[1.08]">
          {t("heroTitle")}
        </h1>
        <p className="mt-4 max-w-[560px] text-pretty text-lg leading-7 text-muted-foreground">
          {t("heroSubtitle")}
        </p>
        <Link
          href="/map"
          className="mt-6 inline-flex h-12 items-center gap-2 rounded-sm border border-primary bg-primary px-5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Map className="size-4" />
          {t("exploreMap")}
        </Link>
      </section>

      <section className={`pb-[clamp(28px,5vw,64px)] ${GUTTER}`}>
        <h2 className="border-b border-t-2 border-foreground py-2 font-serif text-[22px] font-semibold leading-7">
          {t("featuresTitle")}
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-10">
          {features.map(({ icon: Icon, title, desc, map }) => (
            <div key={title} className="border-b border-border py-4">
              <Icon className="size-[22px] text-primary" aria-hidden />
              <h3 className="mb-1 mt-2 font-serif text-xl font-semibold leading-[26px]">{title}</h3>
              <p className="text-pretty text-muted-foreground">{desc}</p>
              {map && (
                <Link
                  href="/map"
                  className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline underline-offset-2 hover:text-foreground"
                >
                  {t("viewMap")}
                  <ArrowRight className="size-4" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <footer
        className={`mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-foreground py-3 text-sm text-muted-foreground ${GUTTER}`}
      >
        <span className="flex-[1_1_260px]">{t("footerNote")}</span>
        <Link
          href="/terms"
          className="flex min-h-11 items-center text-primary underline underline-offset-2 hover:text-foreground"
        >
          {t("footerTerms")}
        </Link>
      </footer>
    </div>
  )
}
