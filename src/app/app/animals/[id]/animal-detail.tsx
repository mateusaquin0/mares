"use client"

import { type ReactNode } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { ArrowLeft } from "lucide-react"

import { useAnimal } from "@/hooks/use-animals"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SamplesTab } from "./samples-tab"
import { AnalysesTab } from "./analyses-tab"
import { MediaTab } from "./media-tab"
import { AuditTab } from "./audit-tab"

export function AnimalDetail({ id, isOrgAdmin }: { id: string; isOrgAdmin: boolean }) {
  const t = useTranslations("animals")
  const tc = useTranslations("common")
  const locale = useLocale()
  const animalQ = useAnimal(id)
  const animal = animalQ.data ?? null
  const loading = animalQ.isLoading

  const sexLabel = (s: string | null) =>
    s === "M" ? t("sexMale") : s === "F" ? t("sexFemale") : s === "U" ? t("sexUndetermined") : s

  const lifeStageLabel = (s: string | null) =>
    ({
      FETUS: t("lifeStageFetus"),
      PUP: t("lifeStagePup"),
      JUVENILE: t("lifeStageJuvenile"),
      ADULT: t("lifeStageAdult"),
      UNDETERMINED: t("lifeStageUndetermined"),
    })[s ?? ""] ?? s

  if (loading) {
    return <p className="p-8 text-sm text-muted-foreground">{tc("loading")}</p>
  }
  if (!animal) {
    return <p className="p-8 text-sm text-muted-foreground">{t("notFound")}</p>
  }

  const na = t("notInformed")
  const coords =
    animal.strandingLat != null && animal.strandingLon != null
      ? `${animal.strandingLat}, ${animal.strandingLon}`
      : na
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
      value: animal.eventDate ? new Date(animal.eventDate).toLocaleDateString(locale) : na,
    },
    {
      label: t("necropsyDate"),
      value: animal.necropsyDate ? new Date(animal.necropsyDate).toLocaleDateString(locale) : na,
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

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold italic tracking-tight">{animal.species}</h1>
        <Badge variant={animal.isPublic ? "default" : "secondary"}>
          {animal.isPublic ? t("public") : t("hidden")}
        </Badge>
        <Link
          href={`/app/research/${animal.research.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          {animal.research.name}
        </Link>
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
              <SamplesTab animalId={id} isOrgAdmin={isOrgAdmin} />
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
    </div>
  )
}
