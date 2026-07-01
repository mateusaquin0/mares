"use client"

import { useTransition } from "react"
import { useLocale } from "next-intl"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"
import { locales, localeNames, type Locale } from "@/i18n/config"
import { setLocale } from "@/i18n/actions"
import { LocaleFlag } from "@/components/flags"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"

// Seletor de idioma customizado (shadcn/Radix) com bandeiras. Grava o cookie via server
// action e recarrega os dados do servidor.
export function LocaleSwitcher({ className }: { className?: string }) {
  const active = useLocale() as Locale
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onChange(next: string) {
    startTransition(async () => {
      await setLocale(next)
      router.refresh()
    })
  }

  return (
    <Select value={active} onValueChange={onChange} disabled={pending}>
      {/* Gatilho compacto: apenas a bandeira do idioma ativo. O texto aparece nas opções. */}
      <SelectTrigger
        className={cn(
          "h-8 w-auto gap-1 border-transparent px-2 shadow-none [&>svg]:opacity-60",
          className
        )}
        aria-label={localeNames[active]}
      >
        <LocaleFlag locale={active} />
      </SelectTrigger>
      <SelectContent>
        {locales.map((l: Locale) => (
          <SelectItem key={l} value={l}>
            <span className="flex items-center gap-2">
              <LocaleFlag locale={l} />
              {localeNames[l]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
