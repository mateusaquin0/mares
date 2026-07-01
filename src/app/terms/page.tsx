import Link from "next/link"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { TERMS_VERSION } from "@/lib/terms"
import { Logo } from "@/components/logo"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("terms")
  return { title: t("title") }
}

export default async function TermsPage() {
  const t = await getTranslations("terms")
  const sections = ["data", "usage", "privacy", "responsibility", "changes"] as const

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-lg font-bold tracking-tight"
      >
        <Logo className="size-6 text-sky-600" />
        MARES
      </Link>

      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("version", { version: TERMS_VERSION })}
      </p>

      <p className="mt-6 text-sm leading-relaxed text-foreground/90">{t("intro")}</p>

      <div className="mt-8 space-y-6">
        {sections.map((s) => (
          <section key={s}>
            <h2 className="text-lg font-semibold">{t(`${s}.title`)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">{t(`${s}.body`)}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
