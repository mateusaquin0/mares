"use client"

import { useCallback, useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"

import { pathogenName, txt, type I18nText } from "@/lib/catalog-i18n"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type AuditRow = {
  id: string
  changedAt: string
  field: string
  oldValue: string | null
  newValue: string | null
  author: string
  pathogen: { scientificName: string | null; name: string | I18nText | null } | null
  examType: { name: string | I18nText } | null
  organ: { name: string | I18nText } | null
}

export function AuditTab({ animalId }: { animalId: string }) {
  const t = useTranslations("audit")
  const ta = useTranslations("analyses")
  const tc = useTranslations("common")
  const locale = useLocale()
  const [items, setItems] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/animals/${animalId}/audit`)
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }, [animalId])

  useEffect(() => {
    load()
  }, [load])

  const fieldLabel = (f: string) =>
    ({ result: t("fieldResult"), ctValue: t("fieldCt"), notes: t("fieldNotes") })[f] ?? f

  // Traduz valores de resultado; demais campos são exibidos crus.
  const valueLabel = (field: string, v: string | null) => {
    if (v == null || v === "") return t("emptyValue")
    if (field === "result") {
      return (
        {
          POSITIVO: ta("resultPositive"),
          NEGATIVO: ta("resultNegative"),
          INCONCLUSIVO: ta("resultInconclusive"),
        } as Record<string, string>
      )[v] ?? v
    }
    return v
  }

  const contextOf = (r: AuditRow) =>
    [
      r.organ ? txt(locale, r.organ.name) : null,
      r.pathogen ? pathogenName(locale, r.pathogen) : null,
      r.examType ? txt(locale, r.examType.name) : null,
    ]
      .filter(Boolean)
      .join(" · ")

  const fmt = (iso: string) => new Date(iso).toLocaleString(locale)

  if (loading) return <p className="text-sm text-muted-foreground">{tc("loading")}</p>
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("colWhen")}</TableHead>
            <TableHead>{t("colWho")}</TableHead>
            <TableHead>{t("colContext")}</TableHead>
            <TableHead>{t("colField")}</TableHead>
            <TableHead>{t("colChange")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {fmt(r.changedAt)}
              </TableCell>
              <TableCell>{r.author}</TableCell>
              <TableCell className="text-muted-foreground">{contextOf(r)}</TableCell>
              <TableCell>{fieldLabel(r.field)}</TableCell>
              <TableCell>
                <span className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground line-through">
                    {valueLabel(r.field, r.oldValue)}
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{valueLabel(r.field, r.newValue)}</span>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
