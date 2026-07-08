"use client"

import { useLocale, useTranslations } from "next-intl"
import { ArrowRight, Clock, User, Fish, FlaskConical, Microscope } from "lucide-react"

import { pathogenName, txt } from "@/lib/catalog-i18n"
import { SEX_OPTIONS, LIFE_STAGE_OPTIONS } from "@/lib/animal-enums"
import { useAnimalAudit } from "@/hooks/use-animals"
import type { AuditEntry } from "@/types/animal"
import { Badge } from "@/components/ui/badge"
import { TableSkeleton } from "@/components/ui/skeleton"

const SEX_KEY = Object.fromEntries(SEX_OPTIONS.map((o) => [o.value, o.key]))
const LIFE_STAGE_KEY = Object.fromEntries(LIFE_STAGE_OPTIONS.map((o) => [o.value, o.key]))
const SAMPLE_STATUS_KEY: Record<string, string> = {
  STORED: "statusStored",
  IN_USE: "statusInUse",
  DEPLETED: "statusDepleted",
  DEGRADED: "statusDegraded",
}
const DATE_FIELDS = new Set(["eventDate", "necropsyDate", "collectionDate"])

export function AuditTab({ animalId }: { animalId: string }) {
  const t = useTranslations("audit")
  const ta = useTranslations("analyses")
  const tan = useTranslations("animals")
  const ts = useTranslations("samples")
  const locale = useLocale()
  const auditQ = useAnimalAudit(animalId)
  const items = auditQ.data ?? []
  const loading = auditQ.isLoading

  // Ícone + rótulo da entidade de origem da entrada.
  const entityMeta = (e: AuditEntry["entity"]) =>
    ({
      Animal: { icon: Fish, label: t("entityAnimal") },
      Sample: { icon: FlaskConical, label: t("entitySample") },
      Analysis: { icon: Microscope, label: t("entityAnalysis") },
    })[e]

  const fieldLabel = (r: AuditEntry) => {
    if (r.field === "created") return t("created")
    if (r.entity === "Analysis") {
      return (
        (
          {
            result: t("fieldResult"),
            measureValue: t("fieldMeasure"),
            ctValue: t("fieldMeasure"), // legado
            notes: t("fieldNotes"),
          } as Record<string, string>
        )[r.field] ?? r.field
      )
    }
    if (r.field === "isPublic") return t("fieldVisibility")
    if (r.entity === "Animal") return tan.has(r.field) ? tan(r.field) : r.field
    return ts.has(r.field) ? ts(r.field) : r.field // Sample
  }

  const valueLabel = (r: AuditEntry, v: string | null) => {
    if (v == null || v === "") return t("emptyValue")
    if (r.entity === "Analysis" && r.field === "result") {
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
    if (r.field === "isPublic") return v === "true" ? t("valuePublic") : t("valuePrivate")
    if (r.field === "sex" && SEX_KEY[v]) return tan(SEX_KEY[v])
    if (r.field === "lifeStage" && LIFE_STAGE_KEY[v]) return tan(LIFE_STAGE_KEY[v])
    if (r.field === "status" && SAMPLE_STATUS_KEY[v]) return ts(SAMPLE_STATUS_KEY[v])
    if (DATE_FIELDS.has(r.field)) {
      const d = new Date(v)
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(locale)
    }
    return v
  }

  const resultVariant = (
    r: AuditEntry,
    v: string | null,
  ): "positive" | "negative" | "inconclusive" | "secondary" => {
    if (r.entity !== "Analysis" || r.field !== "result" || !v) return "secondary"
    return v === "POSITIVO"
      ? "positive"
      : v === "NEGATIVO"
        ? "negative"
        : v === "INCONCLUSIVO"
          ? "inconclusive"
          : "secondary"
  }

  // Contexto exibido abaixo do cabeçalho: amostra e (para análises) órgão·patógeno·exame.
  const contextOf = (r: AuditEntry) =>
    [
      r.sample ? r.sample.identification : null,
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
        {items.map((r) => {
          const meta = entityMeta(r.entity)
          const Icon = meta.icon
          const isCreated = r.field === "created"
          return (
            <div key={r.id} className="relative pl-8">
              {/* Timeline dot */}
              <div className="absolute left-0 top-2 -translate-x-1/2 size-3 rounded-full border-2 border-accent-foreground bg-card" />

              <div className="rounded-lg border bg-card p-4 shadow-sm">
                {/* Header: entity + date + author */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    <Icon className="size-3.5" />
                    {meta.label}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    {fmtDate(r.changedAt)} · {fmtTime(r.changedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <User className="size-3" />
                    {r.author}
                  </span>
                </div>

                {/* Context (sample · organ · pathogen · exam) */}
                {contextOf(r) && (
                  <p className="mt-1 text-xs text-muted-foreground">{contextOf(r)}</p>
                )}

                {/* Change detail */}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{fieldLabel(r)}</span>
                  {isCreated ? (
                    <Badge variant="secondary" className="text-xs">
                      {r.newValue}
                    </Badge>
                  ) : (
                    <>
                      <Badge variant={resultVariant(r, r.oldValue)} className="text-xs">
                        {valueLabel(r, r.oldValue)}
                      </Badge>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                      <Badge variant={resultVariant(r, r.newValue)} className="text-xs">
                        {valueLabel(r, r.newValue)}
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
