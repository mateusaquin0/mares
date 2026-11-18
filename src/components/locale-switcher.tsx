"use client"

import { useTransition } from "react"
import { useLocale } from "next-intl"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"
import { locales, localeNames, type Locale } from "@/i18n/config"
import { setLocale } from "@/i18n/actions"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

// Seletor de idioma das páginas públicas: mostra a sigla do idioma ativo e abre a lista com
// os nomes. Grava o cookie via server action e recarrega os dados do servidor.
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
      <SelectTrigger
        className={cn(
          "h-11 w-auto min-w-11 justify-center border-transparent bg-transparent px-2 text-sm font-semibold uppercase shadow-none hover:bg-accent [&>svg]:hidden",
          className,
        )}
        aria-label={localeNames[active]}
        title={localeNames[active]}
      >
        {active.slice(0, 2)}
      </SelectTrigger>
      <SelectContent>
        {locales.map((l: Locale) => (
          <SelectItem key={l} value={l}>
            {localeNames[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
