"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { ArrowLeft } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SamplesTab } from "./samples-tab"
import { AnalysesTab } from "./analyses-tab"
import { MediaTab } from "./media-tab"
import { AuditTab } from "./audit-tab"

type Animal = {
  id: string
  species: string
  wormsAphiaId: number | null
  taxonFamily: string | null
  taxonOrder: string | null
  controlId: string | null
  simbaRecordNumber: string | null
  sex: string | null
  lifeStage: string | null
  bodyCondition: string | null
  decompositionStage: string | null
  strandingLat: number | null
  strandingLon: number | null
  strandingBeach: string | null
  municipality: string | null
  state: string | null
  eventDate: string | null
  macroscopicNotes: string | null
  isPublic: boolean
  research: { id: string; name: string }
  _count: { samples: number; media: number }
}

export function AnimalDetail({ id, isOrgAdmin }: { id: string; isOrgAdmin: boolean }) {
  const t = useTranslations("animals")
  const tc = useTranslations("common")
  const locale = useLocale()
  const [animal, setAnimal] = useState<Animal | null>(null)
  const [loading, setLoading] = useState(true)
  const [gridReload, setGridReload] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/animals/${id}`)
    if (res.ok) setAnimal(await res.json())
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const sexLabel = (s: string | null) =>
    s === "M" ? t("sexMale") : s === "F" ? t("sexFemale") : s === "U" ? t("sexUndetermined") : s

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
    { label: t("lifeStage"), value: animal.lifeStage ?? na },
    { label: t("bodyCondition"), value: animal.bodyCondition ?? na },
    { label: t("decompositionStage"), value: animal.decompositionStage ?? na },
    {
      label: t("eventDate"),
      value: animal.eventDate ? new Date(animal.eventDate).toLocaleDateString(locale) : na,
    },
    { label: t("strandingBeach"), value: animal.strandingBeach ?? na },
    { label: t("municipality"), value: animal.municipality ?? na },
    { label: t("state"), value: animal.state ?? na },
    { label: `${t("strandingLat")} / ${t("strandingLon")}`, value: coords },
  ]

  return (
    <div className="space-y-6 p-8">
      <Link
        href="/app/animals"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold italic">{animal.species}</h1>
        <Badge variant={animal.isPublic ? "default" : "secondary"}>
          {animal.isPublic ? t("public") : t("private")}
        </Badge>
        <Link
          href={`/app/research/${animal.research.id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          {animal.research.name}
        </Link>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
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

        <TabsContent value="info" className="mt-4 space-y-4">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {rows.map((r) => (
              <div key={r.label} className="flex flex-col">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {r.label}
                </dt>
                <dd className="text-sm">{r.value}</dd>
              </div>
            ))}
          </dl>
          {animal.macroscopicNotes && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("macroscopicNotes")}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{animal.macroscopicNotes}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="samples" className="mt-4">
          <SamplesTab
            animalId={id}
            isOrgAdmin={isOrgAdmin}
            onChanged={() => setGridReload((k) => k + 1)}
          />
        </TabsContent>
        <TabsContent value="analyses" className="mt-4">
          <AnalysesTab animalId={id} reloadKey={gridReload} />
        </TabsContent>
        <TabsContent value="media" className="mt-4">
          <MediaTab animalId={id} isOrgAdmin={isOrgAdmin} />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTab animalId={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
