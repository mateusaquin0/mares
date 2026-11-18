"use client"

import { Check, Clock, X } from "lucide-react"
import { useTranslations } from "next-intl"

import type { CatalogRequestStatus } from "@/types/catalog-request"
import { Badge } from "@/components/ui/badge"

// Pendente pede atenção; aprovada e rejeitada são o desfecho, com a cor do resultado.
const STATUS_META: Record<
  CatalogRequestStatus,
  { variant: "warning" | "positive" | "destructive"; icon: typeof Clock }
> = {
  PENDING: { variant: "warning", icon: Clock },
  APPROVED: { variant: "positive", icon: Check },
  REJECTED: { variant: "destructive", icon: X },
}

export function RequestStatusBadge({ status }: { status: CatalogRequestStatus }) {
  const t = useTranslations("catalogRequests")
  const { variant, icon: Icon } = STATUS_META[status]
  return (
    <Badge variant={variant}>
      <Icon />
      {t(`status_${status}`)}
    </Badge>
  )
}
