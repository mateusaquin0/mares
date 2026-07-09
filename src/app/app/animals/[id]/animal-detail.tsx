"use client"

import { type ReactNode, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useLocale, useTranslations } from "next-intl"
import { ArrowLeft, Fish, Pencil } from "lucide-react"

import { useAnimal } from "@/hooks/use-animals"
import { useResearchList } from "@/hooks/use-research"
import { formatDateOnly } from "@/lib/date"
import { SEX_OPTIONS, LIFE_STAGE_OPTIONS } from "@/lib/animal-enums"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AnimalFormDialog } from "../animal-form"
import { ResearchShare } from "./research-share"
import { SamplesTab } from "./samples-tab"
import { AnalysesTab } from "./analyses-tab"
import { MediaTab } from "./media-tab"
import { AuditTab } from "./audit-tab"

// Mapa depende de `window` (Leaflet) — nunca renderiza no servidor.
const PointMap = dynamic(() => import("@/components/map/point-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-accent/40" />,
})

export function AnimalDetail({ id, isOrgAdmin }: { id: string; isOrgAdmin: boolean }) {
  const t = useTranslations("animals")
  const tc = useTranslations("common")
  const locale = useLocale()
  const animalQ = useAnimal(id)
  const animal = animalQ.data ?? null
  const loading = animalQ.isLoading
  const [editing, setEditing] = useState(false)
  const researchQ = useResearchList()
  const researches = (researchQ.data ?? []).map((r) => ({ id: r.id, name: r.name }))

  const sexLabel = (s: string | null) => {
    const o = SEX_OPTIONS.find((x) => x.value === s)
    return o ? t(o.key) : s
  }

  const lifeStageLabel = (s: string | null) => {
    const o = LIFE_STAGE_OPTIONS.find((x) => x.value === s)
    return o ? t(o.key) : s
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <TableSkeleton rows={4} />
      </div>
    )
  }
  if (!animal) {
    return <p className="p-8 text-sm text-muted-foreground">{t("notFound")}</p>
  }

  const na = t("notInformed")
  // Espécie nula = indeterminada (carcaça não identificável).
  const speciesLabel = animal.species ?? t("speciesUndetermined")
  const hasCoords = animal.strandingLat != null && animal.strandingLon != null
  const coords = hasCoords ? `${animal.strandingLat}, ${animal.strandingLon}` : na
  const locationLabel =
    [animal.strandingBeach, animal.municipality, animal.state].filter(Boolean).join(", ") ||
    speciesLabel
  const rows: { label: string; value: ReactNode }[] = [
    { label: t("taxonFamily"), value: animal.taxonFamily ?? na },
    { label: t("taxonOrder"), value: animal.taxonOrder ?? na },
    { label: t("controlId"), value: animal.controlId ?? na },
    { label: t("simbaRecordNumber"), value: animal.simbaRecordNumber ?? na },
    { label: t("sex"), value: sexLabel(animal.sex) ?? na },
    { label: t("lifeStage"), value: lifeStageLabel(animal.lifeStage) ?? na },
    { label: t("bodyCondition"), value: animal.bodyCondition ?? na },
    { label: t("decompositionStage"), value: animal.decompositionStage ?? na },
    { label: t("deathCondition"), value: animal.deathCondition ?? na },
    {
      label: t("eventDate"),
      value: animal.eventDate ? formatDateOnly(animal.eventDate, locale) : na,
    },
    {
      label: t("necropsyDate"),
      value: animal.necropsyDate ? formatDateOnly(animal.necropsyDate, locale) : na,
    },
    { label: t("strandingBeach"), value: animal.strandingBeach ?? na },
    { label: t("municipality"), value: animal.municipality ?? na },
    { label: t("state"), value: animal.state ?? na },
    { label: `${t("strandingLat")} / ${t("strandingLon")}`, value: coords },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <Link
        href="/app/animals"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("back")}
      </Link>

      <div className="flex items-start gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Fish className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold italic tracking-tight">{speciesLabel}</h1>
            <Badge variant={animal.isPublic ? "public" : "private"}>
              {animal.isPublic ? t("public") : t("hidden")}
            </Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {[animal.controlId, [animal.municipality, animal.state].filter(Boolean).join(", ")]
              .filter(Boolean)
              .join(" · ")}
            {(animal.controlId || animal.municipality || animal.state) && (
              <span aria-hidden>·</span>
            )}
            <Link
              href={`/app/research/${animal.research.id}`}
              className="text-accent-foreground hover:underline"
            >
              {animal.research.name}
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            {tc("edit")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="flex-wrap">
          <TabsTrigger value="info">{t("detailInfo")}</TabsTrigger>
          <TabsTrigger value="samples">
            {t("samplesTab")} ({animal._count.samples})
          </TabsTrigger>
          <TabsTrigger value="analyses">{t("analysesTab")}</TabsTrigger>
          <TabsTrigger value="media">
            {t("mediaTab")} ({animal._count.media})
          </TabsTrigger>
          <TabsTrigger value="audit">{t("auditTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardContent className="space-y-6 pt-6">
              <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((r) => (
                  <div key={r.label} className="flex flex-col gap-0.5">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {r.label}
                    </dt>
                    <dd className="text-sm text-foreground">{r.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="border-t pt-4">
                <ResearchShare animal={animal} />
              </div>
              {hasCoords && (
                <div className="border-t pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("strandingLocationMap")}
                  </p>
                  <div className="h-[320px] overflow-hidden rounded-lg border">
                    <PointMap
                      lat={animal.strandingLat as number}
                      lon={animal.strandingLon as number}
                      label={locationLabel}
                    />
                  </div>
                </div>
              )}
              {animal.macroscopicNotes && (
                <div className="border-t pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("macroscopicNotes")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{animal.macroscopicNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="samples" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <SamplesTab
                animalId={id}
                isOrgAdmin={isOrgAdmin}
                researches={[animal.research, ...animal.participations.map((p) => p.research)]}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="analyses" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <AnalysesTab animalId={id} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="media" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <MediaTab animalId={id} isOrgAdmin={isOrgAdmin} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <AuditTab animalId={id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AnimalFormDialog
        open={editing}
        mode="edit"
        animalId={id}
        researches={researches}
        defaultResearchId={animal.research.id}
        isOrgAdmin={isOrgAdmin}
        onOpenChange={setEditing}
        onSaved={() => {
          setEditing(false)
          animalQ.refetch()
        }}
      />
    </div>
  )
}
