"use client"

import { Bug, CircleCheck, CircleSlash, Eye, Inbox, Lightbulb, type LucideIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import type { FeedbackStatus, FeedbackType } from "@/types/feedback"

// As duas telas de feedback — "Meus envios" (autor) e "Sugestões e bugs" (administração) —
// mostram os mesmos tipos e status, mas cada uma tem o seu namespace de i18n, com as mesmas
// chaves. Por isso quem chama informa de qual namespace vêm os rótulos.
export type FeedbackNamespace = "myFeedback" | "adminFeedback"

type BadgeMeta = { icon: LucideIcon; labelKey: string; variant: BadgeProps["variant"] }

export const FEEDBACK_TYPE_META: Record<FeedbackType, BadgeMeta> = {
  BUG: { icon: Bug, labelKey: "typeBug", variant: "destructive" },
  SUGGESTION: { icon: Lightbulb, labelKey: "typeSuggestion", variant: "secondary" },
}

export const FEEDBACK_STATUS_META: Record<FeedbackStatus, BadgeMeta> = {
  NEW: { icon: Inbox, labelKey: "status_NEW", variant: "inconclusive" },
  IN_REVIEW: { icon: Eye, labelKey: "status_IN_REVIEW", variant: "private" },
  RESOLVED: { icon: CircleCheck, labelKey: "status_RESOLVED", variant: "positive" },
  WONT_FIX: { icon: CircleSlash, labelKey: "status_WONT_FIX", variant: "negative" },
}

// `iconOnly` esconde o rótulo dos olhos, não dos leitores de tela: o texto continua no DOM
// (sr-only) e vira tooltip no `title` — mesmo contrato do SampleStatusBadge.
function MetaBadge({
  meta,
  ns,
  iconOnly,
  className,
}: {
  meta: BadgeMeta
  ns: FeedbackNamespace
  iconOnly: boolean
  className?: string
}) {
  const t = useTranslations(ns)
  const label = t(meta.labelKey)
  const Icon = meta.icon

  return (
    <Badge
      variant={meta.variant}
      title={label}
      className={cn("gap-1", iconOnly && "px-1.5", className)}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className={cn("whitespace-nowrap", iconOnly && "sr-only")}>{label}</span>
    </Badge>
  )
}

export function FeedbackTypeBadge({
  type,
  ns,
  iconOnly = false,
  className,
}: {
  type: FeedbackType
  ns: FeedbackNamespace
  iconOnly?: boolean
  className?: string
}) {
  return (
    <MetaBadge meta={FEEDBACK_TYPE_META[type]} ns={ns} iconOnly={iconOnly} className={className} />
  )
}

export function FeedbackStatusBadge({
  status,
  ns,
  iconOnly = false,
  className,
}: {
  status: FeedbackStatus
  ns: FeedbackNamespace
  iconOnly?: boolean
  className?: string
}) {
  return (
    <MetaBadge
      meta={FEEDBACK_STATUS_META[status]}
      ns={ns}
      iconOnly={iconOnly}
      className={className}
    />
  )
}
