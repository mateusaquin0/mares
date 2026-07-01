import { cn } from "@/lib/utils"

// Bandeira do país via flag-icons (CSS). Renderiza consistente no Windows — ao contrário do
// emoji de bandeira. `iso2` é o código ISO 3166-1 alpha-2 (ex.: "BR", "US").
export function CountryFlag({ iso2, className }: { iso2?: string | null; className?: string }) {
  if (!iso2) return null
  return (
    <span
      className={cn(`fi fi-${iso2.toLowerCase()}`, "inline-block rounded-[2px]", className)}
      aria-hidden
    />
  )
}
