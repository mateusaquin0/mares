"use client"

import { useTranslations } from "next-intl"
import { Microscope, Package, PackageOpen, TriangleAlert, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import type { SampleStatus } from "@/types/sample"

export const SAMPLE_STATUS_META: Record<
  SampleStatus,
  { icon: LucideIcon; labelKey: string; variant: BadgeProps["variant"] }
> = {
  STORED: { icon: Package, labelKey: "statusStored", variant: "highlight" },
  IN_USE: { icon: Microscope, labelKey: "statusInUse", variant: "default" },
  DEPLETED: { icon: PackageOpen, labelKey: "statusDepleted", variant: "faded" },
  DEGRADED: { icon: TriangleAlert, labelKey: "statusDegraded", variant: "destructive" },
}

export const SAMPLE_STATUSES = Object.keys(SAMPLE_STATUS_META) as SampleStatus[]

export function useSampleStatusLabel() {
  const t = useTranslations("samples")
  return (status: string) => {
    const meta = SAMPLE_STATUS_META[status as SampleStatus]
    return meta ? t(meta.labelKey) : status
  }
}

export function SampleStatusIcon({ status, className }: { status: string; className?: string }) {
  const Icon = SAMPLE_STATUS_META[status as SampleStatus]?.icon
  return Icon ? <Icon className={cn("size-3.5 shrink-0", className)} aria-hidden /> : null
}

export function SampleStatusBadge({
  status,
  iconOnly = false,
  className,
}: {
  status: string
  iconOnly?: boolean
  className?: string
}) {
  const label = useSampleStatusLabel()(status)
  const meta = SAMPLE_STATUS_META[status as SampleStatus]

  return (
    <Badge
      variant={meta?.variant ?? "secondary"}
      title={label}
      className={cn("gap-1", iconOnly && "px-1.5", className)}
    >
      <SampleStatusIcon status={status} />
      <span className={cn("whitespace-nowrap", iconOnly && "sr-only")}>{label}</span>
    </Badge>
  )
}
