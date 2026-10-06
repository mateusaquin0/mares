"use client"

import {
  Bug,
  CircleCheck,
  CircleSlash,
  Eye,
  Inbox,
  Lightbulb,
  RotateCcw,
  type LucideIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import type { FeedbackStatus, FeedbackType } from "@/types/feedback"

// As duas telas de feedback — "Meus envios" (autor) e "Sugestões e bugs" (administração) —
// mostram os mesmos tipos e status, mas cada uma tem o seu namespace de i18n, com as mesmas
// chaves. Por isso quem chama informa de qual namespace vêm os rótulos.
export type FeedbackNamespace = "myFeedback" | "adminFeedback"

// `dot` é a mesma cor do badge reduzida a um ponto, para listas onde o badge inteiro pesa
// demais (o menu "mover para"). Fica junto do resto para não virar um segundo mapa de cores.
type BadgeMeta = {
  icon: LucideIcon
  labelKey: string
  variant: BadgeProps["variant"]
  dot: string
}

export const FEEDBACK_TYPE_META: Record<FeedbackType, BadgeMeta> = {
  BUG: { icon: Bug, labelKey: "typeBug", variant: "destructive", dot: "bg-destructive" },
  SUGGESTION: {
    icon: Lightbulb,
    labelKey: "typeSuggestion",
    variant: "secondary",
    dot: "bg-muted-foreground",
  },
}

export const FEEDBACK_STATUS_META: Record<FeedbackStatus, BadgeMeta> = {
  NEW: { icon: Inbox, labelKey: "status_NEW", variant: "inconclusive", dot: "bg-amber-500" },
  IN_REVIEW: { icon: Eye, labelKey: "status_IN_REVIEW", variant: "private", dot: "bg-primary" },
  RESOLVED: {
    icon: CircleCheck,
    labelKey: "status_RESOLVED",
    variant: "positive",
    dot: "bg-[hsl(var(--bio))]",
  },
  WONT_FIX: {
    icon: CircleSlash,
    labelKey: "status_WONT_FIX",
    variant: "negative",
    dot: "bg-muted-foreground",
  },
  // Encerrado que o autor pediu para revisitar: volta à fila do admin, por isso o mesmo
  // destaque de "pendente" que o NEW.
  REOPENED: {
    icon: RotateCcw,
    labelKey: "status_REOPENED",
    variant: "inconclusive",
    dot: "bg-amber-500",
  },
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
