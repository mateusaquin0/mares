import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowRight, Map, FlaskConical, Share2 } from "lucide-react"

import { getAuthUser } from "@/lib/auth"
import { Logo } from "@/components/logo"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { ThemeToggle } from "@/components/theme-toggle"

// Landing pública ("/"): apresenta o MARES e dá acesso direto ao mapa público (sem login).
// O middleware trata "/" como rota pública. Se houver sessão, o CTA leva ao painel.
export default async function Home() {
  const t = await getTranslations("landing")
  const user = await getAuthUser()
  const authHref = user ? "/app/dashboard" : "/login"
  const authLabel = user ? t("goToApp") : t("signIn")

  const features = [
    { icon: Map, title: t("featureMapTitle"), desc: t("featureMapDesc") },
    { icon: FlaskConical, title: t("featureRecordTitle"), desc: t("featureRecordDesc") },
    { icon: Share2, title: t("featureOpenTitle"), desc: t("featureOpenDesc") },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <section
        className="relative overflow-hidden text-white"
        style={{ background: "linear-gradient(160deg, #002147 0%, #003366 55%, #006876 130%)" }}
      >
        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-white/10">
              <Logo className="size-6" />
            </span>
            <span className="text-xl font-bold tracking-tight">MARES</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle className="text-white/80 hover:bg-white/10 hover:text-white" />
            <LocaleSwitcher className="text-white/80 hover:text-white" />
            <Link
              href={authHref}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/20 transition hover:bg-white/20"
            >
              {authLabel}
            </Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24 pt-16 sm:pb-28 sm:pt-24">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/80">
            {t("heroSubtitle")}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/map"
              className="group inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-primary shadow-lg transition hover:bg-white/90 dark:text-primary-foreground"
            >
              <Map className="size-4" />
              {t("exploreMap")}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href={authHref}
              className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              {authLabel}
            </Link>
          </div>
        </div>

        <Logo className="pointer-events-none absolute -bottom-24 -right-16 size-96 text-white/[0.05]" />
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("featuresTitle")}
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              {title === t("featureMapTitle") && (
                <Link
                  href="/map"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent-foreground hover:underline"
                >
                  {t("viewMap")}
                  <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-auto border-t border-border bg-background">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span className="flex items-center gap-2">
            <Logo className="size-4 text-primary" />
            {t("footerNote")}
          </span>
          <Link href="/terms" className="transition-colors hover:text-foreground hover:underline">
            {t("footerTerms")}
          </Link>
        </div>
      </footer>
    </div>
  )
}
