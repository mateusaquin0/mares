"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useLocale, useTranslations } from "next-intl"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, ChevronDown, Loader2, LogOut, Monitor, Moon, Sun, User } from "lucide-react"

import { cn } from "@/lib/utils"
import { useSignOut } from "@/hooks/use-sign-out"
import { locales, localeNames, type Locale } from "@/i18n/config"
import { setLocale } from "@/i18n/actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// "Marina Azevedo" → "Marina A.", para a faixa compacta.
function shortName(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2 || name.includes("@")) return name
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`
}

const sectionLabel =
  "px-3.5 pb-1 pt-2 text-xs font-bold uppercase tracking-[.05em] text-muted-foreground"

function Segment({
  value,
  checked,
  disabled,
  keepOpen,
  children,
}: {
  value: string
  checked: boolean
  disabled?: boolean
  keepOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <DropdownMenuPrimitive.RadioItem
      value={value}
      disabled={disabled}
      onSelect={keepOpen ? (e) => e.preventDefault() : undefined}
      className={cn(
        "flex h-[30px] cursor-pointer select-none items-center justify-center gap-1.5 border-l border-input outline-none first:border-l-0 data-[disabled]:opacity-50 data-[highlighted]:bg-muted [&_svg]:size-3.5",
        checked
          ? "bg-accent font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]"
          : "text-muted-foreground",
      )}
    >
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

// Menu do usuário, no canto direito do topo: perfil, idioma, tema e sair.
export function UserMenu({
  userName,
  email,
  roleLabel,
  short,
}: {
  userName: string
  email: string
  roleLabel: string
  short?: boolean
}) {
  const t = useTranslations("sidebar")
  const active = useLocale() as Locale
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  // next-themes só resolve o tema no cliente; evita divergência de hidratação no item marcado.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [pending, startTransition] = useTransition()
  const { signOut, loading: signingOut } = useSignOut()

  const themeOptions = [
    { value: "light", label: t("themeLight"), icon: Sun },
    { value: "dark", label: t("themeDark"), icon: Moon },
    { value: "system", label: t("themeSystem"), icon: Monitor },
  ] as const

  function changeLocale(next: string) {
    if (next === active) return
    startTransition(async () => {
      await setLocale(next as Locale)
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={email}
        className="group flex shrink-0 items-center gap-1.5 self-stretch outline-none focus-visible:bg-accent"
      >
        {short ? shortName(userName) : userName}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={0} className="w-[260px] p-0 py-1">
        <div className="border-b border-border px-3.5 pb-2 pt-1.5">
          <p className="truncate font-semibold">{userName}</p>
          <p className="truncate text-[13px] text-muted-foreground">{roleLabel || email}</p>
        </div>

        <DropdownMenuItem asChild className="min-h-[34px] gap-2.5 rounded-none px-3.5">
          <Link href="/app/profile">
            <User />
            {t("profile")}
          </Link>
        </DropdownMenuItem>

        <div className="border-t border-border">
          <p className={sectionLabel}>{t("language")}</p>
          <DropdownMenuPrimitive.RadioGroup
            value={active}
            onValueChange={changeLocale}
            aria-label={t("language")}
            className="mx-3.5 mb-2 grid grid-cols-2 rounded-sm border border-input"
          >
            {locales.map((l) => (
              <Segment key={l} value={l} checked={l === active} disabled={pending}>
                {l === active && <Check />}
                {localeNames[l]}
              </Segment>
            ))}
          </DropdownMenuPrimitive.RadioGroup>

          <p className={cn(sectionLabel, "pt-1")}>{t("theme")}</p>
          <DropdownMenuPrimitive.RadioGroup
            value={mounted ? theme : undefined}
            onValueChange={setTheme}
            aria-label={t("theme")}
            className="mx-3.5 mb-2.5 grid grid-cols-3 rounded-sm border border-input"
          >
            {themeOptions.map((o) => {
              const Icon = o.icon
              return (
                <Segment
                  key={o.value}
                  value={o.value}
                  checked={mounted && theme === o.value}
                  keepOpen
                >
                  <Icon />
                  {o.label}
                </Segment>
              )
            })}
          </DropdownMenuPrimitive.RadioGroup>
        </div>

        <DropdownMenuItem
          onSelect={signOut}
          disabled={signingOut}
          className="min-h-[34px] gap-2.5 rounded-none border-t border-border px-3.5 text-destructive focus:text-destructive"
        >
          {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
