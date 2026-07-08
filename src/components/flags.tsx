import { cn } from "@/lib/utils"
import type { Locale } from "@/i18n/config"

// Bandeiras em SVG (mais confiáveis que emoji, que não renderiza como bandeira no Windows).

export function BrazilFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 20" className={cn("h-3.5 w-auto rounded-[2px]", className)} aria-hidden>
      <rect width="28" height="20" fill="#009b3a" />
      <path d="M14 2 L26 10 L14 18 L2 10 Z" fill="#fedf00" />
      <circle cx="14" cy="10" r="4.2" fill="#002776" />
    </svg>
  )
}

export function UsaFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 20" className={cn("h-3.5 w-auto rounded-[2px]", className)} aria-hidden>
      <rect width="28" height="20" fill="#b22234" />
      <g fill="#fff">
        <rect y="1.54" width="28" height="1.54" />
        <rect y="4.62" width="28" height="1.54" />
        <rect y="7.69" width="28" height="1.54" />
        <rect y="10.77" width="28" height="1.54" />
        <rect y="13.85" width="28" height="1.54" />
        <rect y="16.92" width="28" height="1.54" />
      </g>
      <rect width="11.2" height="10.77" fill="#3c3b6e" />
    </svg>
  )
}

export function LocaleFlag({ locale, className }: { locale: Locale; className?: string }) {
  return locale === "pt" ? <BrazilFlag className={className} /> : <UsaFlag className={className} />
}
