import Link from "next/link"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { TERMS_VERSION } from "@/lib/terms"
import { Logo } from "@/components/logo"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("terms")
  return { title: t("title") }
}

// Coluna de leitura de 720px; no celular só as margens mudam.
const COLUMN = "px-[max(16px,calc(50%-360px))]"

export default async function TermsPage() {
  const t = await getTranslations("terms")
  const sections = ["data", "usage", "privacy", "responsibility", "deletion", "changes"] as const

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className={`flex min-h-11 items-center border-b border-foreground py-1.5 ${COLUMN}`}>
        <Link href="/" className="inline-flex min-h-11 items-center gap-2">
          <Logo className="size-6" />
          <span className="font-serif text-[22px] font-semibold tracking-[0.04em]">MARES</span>
        </Link>
      </header>

      <main className={`pb-14 pt-6 ${COLUMN}`}>
        <h1 className="font-serif text-[40px] font-medium leading-[46px]">{t("title")}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t("version", { version: TERMS_VERSION })}
        </p>

        <p className="mt-5 text-pretty text-[15px] leading-[22px]">{t("intro")}</p>

        {sections.map((s) => (
          <section key={s} className="mt-6 border-t border-foreground pt-3">
            <h2 className="font-serif text-xl font-semibold leading-[26px]">{t(`${s}.title`)}</h2>
            <p className="mt-1.5 text-pretty text-[15px] leading-[22px] text-muted-foreground">
              {t(`${s}.body`)}
            </p>
          </section>
        ))}
      </main>
    </div>
  )
}
