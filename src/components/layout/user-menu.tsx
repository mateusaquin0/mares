"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useLocale, useTranslations } from "next-intl"
import { Check, ChevronDown, Loader2, LogOut, Monitor, Moon, Sun, User } from "lucide-react"

import { cn } from "@/lib/utils"
import { useSignOut } from "@/hooks/use-sign-out"
import { locales, localeNames, type Locale } from "@/i18n/config"
import { setLocale } from "@/i18n/actions"
import { LocaleFlag } from "@/components/flags"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Menu do usuário no rodapé da sidebar: idioma, perfil e sair, num único dropdown.
export function UserMenu({
  userName,
  email,
  roleLabel,
  collapsed,
}: {
  userName: string
  email: string
  roleLabel: string
  collapsed: boolean
}) {
  const t = useTranslations("sidebar")
  const active = useLocale() as Locale
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  // next-themes só resolve o tema no cliente; evita divergência de hidratação no check ativo.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [pending, startTransition] = useTransition()
  const { signOut, loading: signingOut } = useSignOut()

  const themeOptions = [
    { value: "light", label: t("themeLight"), icon: Sun },
    { value: "dark", label: t("themeDark"), icon: Moon },
    { value: "system", label: t("themeSystem"), icon: Monitor },
  ] as const

  const initials = (userName || "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  function changeLocale(next: Locale) {
    if (next === active) return
    startTransition(async () => {
      await setLocale(next)
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex w-full items-center gap-3 rounded-lg py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            collapsed ? "justify-center px-0" : "px-2",
          )}
          title={collapsed ? `${userName} — ${email}` : undefined}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </span>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{userName}</p>
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              </div>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium text-foreground">{userName}</p>
          <p className="truncate text-xs text-muted-foreground">{roleLabel || email}</p>
        </div>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/app/profile">
            <User className="size-4" />
            {t("profile")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("language")}
        </DropdownMenuLabel>
        {locales.map((l) => (
          <DropdownMenuItem key={l} disabled={pending} onSelect={() => changeLocale(l)}>
            <LocaleFlag locale={l} />
            <span>{localeNames[l]}</span>
            {l === active && <Check className="ml-auto size-4 text-accent-foreground" />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("theme")}
        </DropdownMenuLabel>
        {themeOptions.map((o) => {
          const Icon = o.icon
          return (
            <DropdownMenuItem
              key={o.value}
              onSelect={(e) => {
                e.preventDefault()
                setTheme(o.value)
              }}
            >
              <Icon className="size-4" />
              <span>{o.label}</span>
              {mounted && theme === o.value && (
                <Check className="ml-auto size-4 text-accent-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={signOut}
          disabled={signingOut}
          className="text-destructive focus:text-destructive"
        >
          {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
