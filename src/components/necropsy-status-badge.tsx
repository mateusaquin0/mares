"use client"

import { useTranslations } from "next-intl"
import { Ban, Check, CircleDashed, TriangleAlert, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import type { NecropsyStatusValue } from "@/lib/necropsy-enums"

// O quarto estado da tela não existe no banco: é a AUSÊNCIA de linha para o sistema.
// `null` o representa aqui, e a distinção entre ele e NO_CHANGE é o ponto da tela —
// "ninguém olhou" versus "a patologista examinou e nada encontrou".
export type NecropsyStatusOrUnset = NecropsyStatusValue | null

const UNSET = "__unset__"

// A ênfase visual segue a informação que cada estado carrega: só ALTERED tem dado por
// trás (sólido, puxa o olho); NO_CHANGE é uma afirmação (verde, contorno firme);
// NOT_EXAMINED é neutro; e "não avaliado" é o mais apagado, tracejado e sem preenchimento.
const STATUS_META: Record<
  string,
  { icon: LucideIcon; labelKey: string; variant: BadgeProps["variant"] }
> = {
  ALTERED: { icon: TriangleAlert, labelKey: "statusAltered", variant: "default" },
  NO_CHANGE: { icon: Check, labelKey: "statusNoChange", variant: "positive" },
  NOT_EXAMINED: { icon: Ban, labelKey: "statusNotExamined", variant: "negative" },
  [UNSET]: { icon: CircleDashed, labelKey: "statusUnset", variant: "faded" },
}

const metaFor = (status: NecropsyStatusOrUnset) => STATUS_META[status ?? UNSET]!

export function useNecropsyStatusLabel() {
  const t = useTranslations("necropsy")
  return (status: NecropsyStatusOrUnset) => t(metaFor(status).labelKey)
}

export function NecropsyStatusIcon({
  status,
  className,
}: {
  status: NecropsyStatusOrUnset
  className?: string
}) {
  const Icon = metaFor(status).icon
  return <Icon className={cn("size-3.5 shrink-0", className)} aria-hidden />
}

export function NecropsyStatusBadge({
  status,
  className,
}: {
  status: NecropsyStatusOrUnset
  className?: string
}) {
  const label = useNecropsyStatusLabel()(status)
  return (
    <Badge variant={metaFor(status).variant} className={cn("gap-1.5", className)}>
      <NecropsyStatusIcon status={status} />
      <span className="whitespace-nowrap">{label}</span>
    </Badge>
  )
}
