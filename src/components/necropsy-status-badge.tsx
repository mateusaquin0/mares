"use client"

import { useTranslations } from "next-intl"
import { Ban, Check, ChevronDown, CircleDashed, TriangleAlert, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import type { NecropsyStatusValue } from "@/lib/necropsy-enums"

// O quarto estado da tela não existe no banco: é a AUSÊNCIA de linha para o sistema.
// `null` o representa aqui, e a distinção entre ele e NO_CHANGE é o ponto da tela —
// "ninguém olhou" versus "a patologista examinou e nada encontrou".
export type NecropsyStatusOrUnset = NecropsyStatusValue | null

const UNSET = "__unset__"

// A ênfase visual segue a informação que cada estado carrega: só ALTERED tem dado por
// trás (cor de alerta); NO_CHANGE é uma afirmação (texto firme, contorno); NOT_EXAMINED é
// neutro; e "não avaliado" é o mais apagado, tracejado.
const STATUS_META: Record<
  string,
  { icon: LucideIcon; labelKey: string; variant: BadgeProps["variant"] }
> = {
  ALTERED: { icon: TriangleAlert, labelKey: "statusAltered", variant: "warning" },
  NO_CHANGE: { icon: Check, labelKey: "statusNoChange", variant: "secondary" },
  NOT_EXAMINED: { icon: Ban, labelKey: "statusNotExamined", variant: "outline" },
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

// `selector`: o selo é o gatilho do menu de estado — largura fixa (os quatro rótulos
// alinham na coluna) e a seta.
export function NecropsyStatusBadge({
  status,
  selector,
  className,
}: {
  status: NecropsyStatusOrUnset
  selector?: boolean
  className?: string
}) {
  const label = useNecropsyStatusLabel()(status)
  return (
    <Badge
      variant={metaFor(status).variant}
      className={cn("gap-1.5", selector && "w-[150px] cursor-pointer justify-between", className)}
    >
      <span className="flex items-center gap-1.5">
        <NecropsyStatusIcon status={status} />
        <span className="whitespace-nowrap">{label}</span>
      </span>
      {selector && <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />}
    </Badge>
  )
}
