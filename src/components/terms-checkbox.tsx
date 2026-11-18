"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { CircleAlert } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"

// Checkbox de aceite dos Termos de Uso, reutilizado no cadastro (solicitar acesso) e na
// aceitação de convite (definir senha). Ver docs/TERMOS_DE_USO.md.
export function TermsCheckbox({
  checked,
  onCheckedChange,
  error,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  error?: string
}) {
  const t = useTranslations("terms")

  return (
    <div>
      <div className="flex min-h-11 items-center gap-2.5">
        <Checkbox
          id="acceptTerms"
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
        />
        <label htmlFor="acceptTerms" className="leading-snug">
          {t.rich("acceptLabel", {
            link: (chunks) => (
              <Link
                href="/terms"
                target="_blank"
                className="text-primary underline underline-offset-2 hover:text-foreground"
              >
                {chunks}
              </Link>
            ),
          })}
        </label>
      </div>
      {error && (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-sm font-semibold text-destructive"
        >
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}
