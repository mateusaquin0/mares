"use client"

import { useLocale, useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"

import { pathogenName, txt } from "@/lib/catalog-i18n"
import { SEX_OPTIONS, LIFE_STAGE_OPTIONS } from "@/lib/animal-enums"
import { formatDateOnly } from "@/lib/date"
import { ANTHROPIC_INTERACTION_OPTIONS, NECROPSY_STATUS_OPTIONS } from "@/lib/necropsy-enums"
import { useAnimalAudit } from "@/hooks/use-animals"
import type { AuditEntry } from "@/types/animal"
import { TableSkeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableEmpty,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const SEX_KEY = Object.fromEntries(SEX_OPTIONS.map((o) => [o.value, o.key]))
const LIFE_STAGE_KEY = Object.fromEntries(LIFE_STAGE_OPTIONS.map((o) => [o.value, o.key]))
const SAMPLE_STATUS_KEY: Record<string, string> = {
  STORED: "statusStored",
  IN_USE: "statusInUse",
  DEPLETED: "statusDepleted",
  DEGRADED: "statusDegraded",
}
const DATE_FIELDS = new Set(["eventDate", "necropsyDate", "collectionDate"])

// No log de um sistema o CAMPO é o NOME do sistema no momento da edição — gravado como
// texto de propósito, para a timeline continuar legível se o item do catálogo for
// renomeado ou excluído depois. Por isso não há tradução a aplicar aqui.
const NECROPSY_STATUS_KEY = Object.fromEntries(NECROPSY_STATUS_OPTIONS.map((o) => [o.value, o.key]))
// Campos escalares dos achados, com as mesmas chaves de rótulo usadas na aba.
const NECROPSY_FIELD_KEY: Record<string, string> = {
  topography: "colTopography",
  lesion: "colLesion",
  distribution: "colDistribution",
  severity: "colSeverity",
  notes: "colNotes",
  parasitesPresent: "colParasitesPresent",
  parasitesCollected: "colParasitesCollected",
  parasiteCount: "colParasiteCount",
  finding: "finding",
}
// A triagem da carcaça grava como campo do ANIMAL (é lá que as colunas vivem), mas os
// rótulos são do namespace da necrópsia — é a aba de necrópsia que a edita.
const SCREENING_FIELD_KEY: Record<string, string> = {
  anthropicInteraction: "anthropicInteraction",
  anthropicInteractions: "interactionsLabel",
  giContentCollected: "giContentCollected",
  giSolidWaste: "giSolidWaste",
  giDetailedScreening: "giDetailedScreening",
}
const INTERACTION_KEY = Object.fromEntries(
  ANTHROPIC_INTERACTION_OPTIONS.map((o) => [o.value, o.key]),
)

export function AuditTab({ animalId }: { animalId: string }) {
  const t = useTranslations("audit")
  const ta = useTranslations("analyses")
  const tan = useTranslations("animals")
  const ts = useTranslations("samples")
  const tn = useTranslations("necropsy")
  const locale = useLocale()
  const auditQ = useAnimalAudit(animalId)
  const items = auditQ.data ?? []
  const loading = auditQ.isLoading

  // Rótulo da entidade de origem da entrada. O `??` é rede de segurança: a rota devolve
  // `entity` como texto do banco, então uma entidade nova que ganhe auditoria e não passe por
  // aqui derrubava o histórico inteiro em vez de aparecer sem tradução.
  const entityLabel = (e: AuditEntry["entity"]) =>
    ({
      Animal: t("entityAnimal"),
      Biometry: t("entityBiometry"),
      Sample: t("entitySample"),
      Analysis: t("entityAnalysis"),
      NecropsySystemExam: t("entityNecropsySystem"),
      GrossFinding: t("entityGrossFinding"),
      HistopathologyFinding: t("entityHistopathology"),
    })[e] ?? e

  const fieldLabel = (r: AuditEntry) => {
    if (r.field === "created") return t("created")
    if (r.field === "deleted") return t("deleted")
    // Sistema: o campo já É o rótulo legível gravado no log.
    if (r.entity === "NecropsySystemExam") return r.field
    // Biometria: idem — o campo é o rótulo LITERAL da medida do SIMBA, sem catálogo e sem
    // tradução. A exceção é o peso, que é coluna do animal e tem rótulo próprio.
    if (r.entity === "Biometry") return tan.has(r.field) ? tan(r.field) : r.field
    if (r.entity === "GrossFinding" || r.entity === "HistopathologyFinding") {
      const key = NECROPSY_FIELD_KEY[r.field]
      return key && tn.has(key) ? tn(key) : r.field
    }
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
    const screeningKey = r.entity === "Animal" ? SCREENING_FIELD_KEY[r.field] : undefined
    if (screeningKey) return tn(screeningKey)
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
    if (r.field === "isPublic") return v === "true" ? t("valueYes") : t("valueNo")
    if (r.field === "sex" && SEX_KEY[v]) return tan(SEX_KEY[v])
    if (r.field === "lifeStage" && LIFE_STAGE_KEY[v]) return tan(LIFE_STAGE_KEY[v])
    if (r.field === "status" && SAMPLE_STATUS_KEY[v]) return ts(SAMPLE_STATUS_KEY[v])
    if (r.entity === "NecropsySystemExam" && NECROPSY_STATUS_KEY[v])
      return tn(NECROPSY_STATUS_KEY[v])
    // A lista de interações é gravada canônica ("FISHERY:2, VESSEL:1") para o log não
    // congelar o idioma de quem editou; a tradução acontece aqui, na leitura.
    if (r.field === "anthropicInteractions") {
      return v
        .split(", ")
        .map((item) => {
          const [type = item, degree = ""] = item.split(":")
          const key = INTERACTION_KEY[type]
          const label = key ? tn(key) : type
          return `${label} (${tn("degreeValue", { degree }).toLowerCase()})`
        })
        .join("; ")
    }
    if (SCREENING_FIELD_KEY[r.field] && (v === "true" || v === "false"))
      return v === "true" ? tn("yes") : tn("no")
    if (DATE_FIELDS.has(r.field)) {
      const day = formatDateOnly(v, locale)
      if (day) return day
    }
    return v
  }

  // Contexto da entrada: amostra e (para análises) órgão · patógeno · exame.
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
    new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })

  if (loading) return <TableSkeleton rows={4} />

  return (
    <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-8">
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[132px]" />
          <col className="w-[168px]" />
          <col />
          <col className="w-[150px]" />
          <col />
        </colgroup>
        <TableHeader className="sticky top-0 z-[1] bg-background">
          <TableRow>
            <TableHead className="pl-0">{t("colWhen")}</TableHead>
            <TableHead>{t("colWho")}</TableHead>
            <TableHead>{t("colContext")}</TableHead>
            <TableHead>{t("colField")}</TableHead>
            <TableHead>{t("colChange")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && <TableEmpty colSpan={4}>{t("empty")}</TableEmpty>}
          {items.map((r) => {
            const isCreated = r.field === "created"
            const context = contextOf(r)
            return (
              <TableRow key={r.id} className="align-baseline hover:bg-transparent">
                <TableCell className="pl-0 tabular-nums">
                  {fmtDate(r.changedAt)} {fmtTime(r.changedAt)}
                </TableCell>
                <TableCell>{r.author}</TableCell>
                <TableCell>
                  <span className="text-xs font-bold uppercase tracking-[.05em] text-muted-foreground">
                    {entityLabel(r.entity)}
                  </span>
                  {context && <> {context}</>}
                </TableCell>
                <TableCell className="text-muted-foreground">{fieldLabel(r)}</TableCell>
                <TableCell>
                  {isCreated ? (
                    <b className="font-semibold">{r.newValue}</b>
                  ) : (
                    <>
                      <span className="text-muted-foreground">{valueLabel(r, r.oldValue)}</span>{" "}
                      <ArrowRight
                        className="inline size-3 text-muted-foreground"
                        aria-label={t("changedTo")}
                      />{" "}
                      <b className="font-semibold">{valueLabel(r, r.newValue)}</b>
                    </>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
