"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"

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
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <Checkbox
          id="acceptTerms"
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          className="mt-0.5"
        />
        <label htmlFor="acceptTerms" className="text-sm leading-snug text-muted-foreground">
          {t.rich("acceptLabel", {
            link: (chunks) => (
              <Link
                href="/terms"
                target="_blank"
                className="font-medium text-primary hover:underline"
              >
                {chunks}
              </Link>
            ),
          })}
        </label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
