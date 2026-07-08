"use client"

import { useLocale, useTranslations } from "next-intl"
import { ArrowRight, Clock, User } from "lucide-react"

import { pathogenName, txt } from "@/lib/catalog-i18n"
import { useAnimalAudit } from "@/hooks/use-animals"
import type { AuditEntry } from "@/types/animal"
import { Badge } from "@/components/ui/badge"
import { TableSkeleton } from "@/components/ui/skeleton"

export function AuditTab({ animalId }: { animalId: string }) {
  const t = useTranslations("audit")
  const ta = useTranslations("analyses")
  const locale = useLocale()
  const auditQ = useAnimalAudit(animalId)
  const items = auditQ.data ?? []
  const loading = auditQ.isLoading

  const fieldLabel = (f: string) =>
    ({
      result: t("fieldResult"),
      measureValue: t("fieldMeasure"),
      ctValue: t("fieldMeasure"), // legado: análises anteriores registravam "ctValue"
      notes: t("fieldNotes"),
    })[f] ?? f

  const valueLabel = (field: string, v: string | null) => {
    if (v == null || v === "") return t("emptyValue")
    if (field === "result") {
      return (
        (
          {
            POSITIVO: ta("resultPositive"),
            NEGATIVO: ta("resultNegative"),
            INCONCLUSIVO: ta("resultInconclusive"),
          } as Record<string, string>
        )[v] ?? v
      )
    }
    return v
  }

  const resultVariant = (
    field: string,
    v: string | null,
  ): "positive" | "negative" | "inconclusive" | "secondary" => {
    if (field !== "result" || !v) return "secondary"
    return v === "POSITIVO"
      ? "positive"
      : v === "NEGATIVO"
        ? "negative"
        : v === "INCONCLUSIVO"
          ? "inconclusive"
          : "secondary"
  }

  const contextOf = (r: AuditEntry) =>
    [
      r.organ ? txt(locale, r.organ.name) : null,
      r.pathogen ? pathogenName(locale, r.pathogen) : null,
      r.examType ? txt(locale, r.examType.name) : null,
    ]
      .filter(Boolean)
      .join(" · ")

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })

  if (loading) return <TableSkeleton rows={4} />
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>

  return (
    <div className="relative ml-4">
      {/* Vertical timeline line */}
      <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />

      <div className="space-y-6">
        {items.map((r) => (
          <div key={r.id} className="relative pl-8">
            {/* Timeline dot */}
            <div className="absolute left-0 top-2 -translate-x-1/2 size-3 rounded-full border-2 border-accent-foreground bg-card" />

            <div className="rounded-lg border bg-card p-4 shadow-sm">
              {/* Header: date + author */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {fmtDate(r.changedAt)} · {fmtTime(r.changedAt)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <User className="size-3" />
                  {r.author}
                </span>
              </div>

              {/* Context (organ · pathogen · exam) */}
              {contextOf(r) && <p className="mt-1 text-xs text-muted-foreground">{contextOf(r)}</p>}

              {/* Change detail */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{fieldLabel(r.field)}</span>
                <Badge variant={resultVariant(r.field, r.oldValue)} className="text-xs">
                  {valueLabel(r.field, r.oldValue)}
                </Badge>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                <Badge variant={resultVariant(r.field, r.newValue)} className="text-xs">
                  {valueLabel(r.field, r.newValue)}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
