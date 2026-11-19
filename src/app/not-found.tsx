import Link from "next/link"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { Fish, House, Waves } from "lucide-react"

import { Logo } from "@/components/logo"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { ThemeToggle } from "@/components/theme-toggle"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notFound")
  return { title: t("metaTitle") }
}

const COLUMN = "px-[max(16px,calc(50%-360px))]"

export default async function NotFound() {
  const t = await getTranslations("notFound")

  return (
    <div className="flex min-h-dvh flex-col bg-background text-base text-foreground">
      <header
        className={`flex min-h-11 items-center justify-between gap-3 border-b border-foreground py-1.5 ${COLUMN}`}
      >
        <Link href="/" className="inline-flex min-h-11 items-center gap-2">
          <Logo className="size-6" />
          <span className="font-serif text-[22px] font-semibold tracking-[0.04em]">MARES</span>
        </Link>
        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className={`flex flex-1 flex-col justify-center py-10 ${COLUMN}`}>
        <div aria-hidden className="flex items-end gap-1 text-primary">
          <Waves className="size-7 opacity-60" />
          <Fish className="mb-3 size-9 -rotate-12" />
          <Waves className="size-7 opacity-60" />
        </div>
        <p className="mt-4 text-[13px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          {t("eyebrow")}
        </p>
        <h1 className="mt-2 max-w-[560px] text-balance font-serif text-[clamp(32px,5vw,44px)] font-medium leading-[1.1]">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-[560px] text-pretty text-lg leading-7">{t("description")}</p>
        <p className="mt-2 max-w-[560px] text-pretty italic text-muted-foreground">{t("joke")}</p>
        <Link
          href="/"
          className="mt-6 inline-flex h-12 items-center gap-2 self-start rounded-sm border border-primary bg-primary px-5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <House className="size-4" />
          {t("goHome")}
        </Link>
      </main>
    </div>
  )
}
