"use client"

import { type ReactNode, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { ArrowLeft, Globe, MapPinOff, Pencil } from "lucide-react"

import { ApiError } from "@/lib/http"
import { cn } from "@/lib/utils"
import { useAnimal } from "@/hooks/use-animals"
import { useResearchList } from "@/hooks/use-research"
import { formatDateOnly } from "@/lib/date"
import { publicationStatus } from "@/lib/publication"
import { SEX_OPTIONS, LIFE_STAGE_OPTIONS } from "@/lib/animal-enums"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataRow, SectionTitle } from "@/components/ui/section"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AnimalFormDialog } from "../animal-form"
import { ResearchShare } from "./research-share"
import { NecropsyTab, NecropsySummary } from "./necropsy-tab"
import { BiometryTab, BiometrySummary } from "./biometry-tab"
import { SamplesTab } from "./samples-tab"
import { AnalysesTab } from "./analyses-tab"
import { MediaTab } from "./media-tab"
import { AuditTab } from "./audit-tab"

const PUBLICATION_LABEL = {
  published: "published",
  researchPrivate: "unpublishedResearchPrivate",
  withheld: "unpublishedWithheld",
} as const

const PUBLICATION_TIP = {
  published: "visMapPublished",
  researchPrivate: "visMapResearchPrivate",
  withheld: "visMapWithheld",
} as const

// Mapa depende de `window` (Leaflet) — nunca renderiza no servidor.
const PointMap = dynamic(() => import("@/components/map/point-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-accent/40" />,
})

export function AnimalDetail({
  id,
  isOrgAdmin,
  selfId,
  backTo,
}: {
  id: string
  isOrgAdmin: boolean
  selfId: string
  // Para onde o "voltar" leva, resolvido na página a partir do `?from=` (ver lib/animal-origin).
  backTo: { href: string; labelKey: string }
}) {
  const t = useTranslations("animals")
  const tc = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()
  const animalQ = useAnimal(id)
  const animal = animalQ.data ?? null
  const loading = animalQ.isLoading
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState("info")
  const researchQ = useResearchList()
  const researches = (researchQ.data ?? []).map((r) => ({ id: r.id, name: r.name }))

  // Acesso a um indivíduo pode terminar ENQUANTO a página está aberta: desfazendo o vínculo
  // da única pesquisa que dava acesso a ele (logo abaixo, em ResearchShare), ou porque outra
  // pessoa removeu esse vínculo/o usuário da pesquisa. Como a visibilidade é reavaliada no
  // servidor a cada refetch, tratamos o 403/404 como "perdeu o acesso" e voltamos à lista —
  // em vez de deixar a tela com dados obsoletos que não podem mais ser recarregados.
  const status = animalQ.error instanceof ApiError ? animalQ.error.status : null
  const lostAccess = status === 403 || status === 404
  useEffect(() => {
    if (!lostAccess) return
    toast.info(t("accessEnded"))
    router.replace(backTo.href)
  }, [lostAccess, router, t, backTo.href])

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
      <div className="space-y-6 px-page py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <TableSkeleton rows={4} />
      </div>
    )
  }
  if (lostAccess) return null
  if (!animal) {
    return <p className="px-page py-8 text-muted-foreground">{t("notFound")}</p>
  }

  const empty = "—"
  // Espécie nula = indeterminada (carcaça não identificável).
  const speciesLabel = animal.species ?? t("speciesUndetermined")
  const publication = publicationStatus(animal.isPublic, animal.research.isPublic)
  const hasCoords = animal.strandingLat != null && animal.strandingLon != null
  const coords = hasCoords ? `${animal.strandingLat}, ${animal.strandingLon}` : empty
  const place = [animal.strandingBeach, animal.municipality, animal.state]
    .filter(Boolean)
    .join(", ")
  const locationLabel = place || speciesLabel
  const date = (d: string | null) => (d ? formatDateOnly(d, locale) : empty)

  const groups: { title: string; rows: [string, ReactNode][] }[] = [
    {
      title: t("sectionIdentification"),
      rows: [
        [t("controlId"), animal.controlId ?? empty],
        [t("simbaRecordNumber"), animal.simbaRecordNumber ?? empty],
        [t("taxonFamily"), animal.taxonFamily ?? empty],
        [t("taxonOrder"), animal.taxonOrder ?? empty],
      ],
    },
    {
      title: t("sectionIndividual"),
      rows: [
        [t("sex"), sexLabel(animal.sex) ?? empty],
        [t("lifeStage"), lifeStageLabel(animal.lifeStage) ?? empty],
        [t("decompositionStage"), animal.decompositionStage ?? empty],
        [t("bodyCondition"), animal.bodyCondition ?? empty],
        [t("deathCondition"), animal.deathCondition ?? empty],
      ],
    },
    {
      title: t("sectionStranding"),
      rows: [
        [t("eventDate"), date(animal.eventDate)],
        [t("strandingBeach"), animal.strandingBeach ?? empty],
        [t("municipality"), animal.municipality ?? empty],
        [t("state"), animal.state ?? empty],
        [`${t("strandingLat")} / ${t("strandingLon")}`, coords],
        [t("executingInstitution"), animal.executingInstitution ?? empty],
      ],
    },
    {
      title: t("necropsyTab"),
      rows: [
        [t("necropsyDate"), date(animal.necropsyDate)],
        [t("necropsyWeightKg"), animal.necropsyWeightKg ?? empty],
      ],
    },
  ]

  // Só as pesquisas que de fato participam: um convite pendente ainda não pode ser dona de
  // amostra nem de arquivo.
  const owners = [
    animal.research,
    ...animal.participations.filter((p) => p.status === "ACCEPTED").map((p) => p.research),
  ]

  const compactTop = tab !== "info"
  const backLink = (
    <Link
      href={backTo.href}
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] underline underline-offset-2 hover:text-primary"
    >
      <ArrowLeft className="size-4" />
      {t(backTo.labelKey)}
    </Link>
  )
  const publicationBadge = (
    <Badge
      variant={publication === "published" ? "public" : "private"}
      title={t(PUBLICATION_TIP[publication])}
      className="shrink-0"
    >
      {publication === "published" ? <Globe /> : <MapPinOff />}
      {t(PUBLICATION_LABEL[publication])}
    </Badge>
  )
  const editButton = (
    <Button variant="outline" className="shrink-0" onClick={() => setEditing(true)}>
      <Pencil className="size-4" />
      {tc("edit")}
    </Button>
  )
  const cityUf = [animal.municipality, animal.state].filter(Boolean).join(", ")
  const subtitle = (
    <span className="text-muted-foreground">
      {animal.controlId && <b className="font-semibold text-foreground">{animal.controlId}</b>}
      {animal.controlId && cityUf && " · "}
      {cityUf}
      {(animal.controlId || cityUf) && " · "}
      <Link
        href={`/app/research/${animal.research.id}`}
        className="underline underline-offset-2 hover:text-foreground"
      >
        {animal.research.name}
      </Link>
    </span>
  )

  return (
    <div className="flex h-full min-h-[42rem] flex-col">
      {/* Nos dados da ocorrência o topo é amplo; nas demais abas fica numa linha só, para
          sobrar altura para tabelas e laudos. */}
      <div className={cn("flex-none px-page", compactTop ? "pt-2" : "pt-3.5")}>
        {compactTop ? (
          <div className="flex items-center gap-3">
            {backLink}
            <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
            <h1 className="min-w-0 truncate font-serif text-[28px] font-medium italic leading-[34px]">
              {speciesLabel}
            </h1>
            {publicationBadge}
            <span className="flex-1" />
            {editButton}
          </div>
        ) : (
          <>
            {backLink}
            <div className="mt-1.5 flex items-end gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-serif text-4xl font-medium italic">{speciesLabel}</h1>
                  {publicationBadge}
                </div>
                <p className="mt-1">{subtitle}</p>
              </div>
              {editButton}
            </div>
          </>
        )}
        {compactTop && <p className="mt-0.5">{subtitle}</p>}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className={cn("flex-none px-page", compactTop ? "pt-1.5" : "pt-3.5")}>
          <TabsList className={compactTop ? "gap-6" : "gap-7"}>
            <TabsTrigger value="info" className="py-2">
              {t("detailInfo")}
            </TabsTrigger>
            <TabsTrigger value="necropsy" className="py-2">
              {t("necropsyTab")}
            </TabsTrigger>
            <TabsTrigger value="biometry" className="py-2">
              {t("biometryTab")}
            </TabsTrigger>
            <TabsTrigger value="samples" className="py-2">
              {t("samplesTab")} ({animal._count.samples})
            </TabsTrigger>
            <TabsTrigger value="analyses" className="py-2">
              {t("analysesTab")}
            </TabsTrigger>
            <TabsTrigger value="media" className="py-2">
              {t("mediaTab")} ({animal._count.media})
            </TabsTrigger>
            <TabsTrigger value="audit" className="py-2">
              {t("auditTab")}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-page py-5">
          {tab === "info" && (
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-10 overflow-y-auto max-xl:gap-8">
              <div className="flex min-w-0 flex-col gap-5">
                <div className="grid grid-cols-2 gap-x-10 gap-y-5 max-xl:grid-cols-1">
                  {groups.map((g) => (
                    <section key={g.title}>
                      <SectionTitle>{g.title}</SectionTitle>
                      <dl>
                        {g.rows.map(([label, value]) => (
                          <DataRow key={label} label={label}>
                            <span className="font-medium">{value}</span>
                          </DataRow>
                        ))}
                      </dl>
                    </section>
                  ))}
                </div>
                <section>
                  <SectionTitle>{t("sectionNotesReports")}</SectionTitle>
                  <dl>
                    <DataRow label={t("macroscopicNotes")} labelWidth="21%" className="py-1.5">
                      {animal.macroscopicNotes ? (
                        <span className="whitespace-pre-wrap text-pretty">
                          {animal.macroscopicNotes}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{empty}</span>
                      )}
                    </DataRow>
                    <NecropsySummary animalId={id} onOpen={() => setTab("necropsy")} />
                    <BiometrySummary animalId={id} onOpen={() => setTab("biometry")} />
                  </dl>
                </section>
              </div>

              <div className="flex min-w-0 flex-col gap-5">
                <section>
                  <SectionTitle>{t("strandingLocationMap")}</SectionTitle>
                  {hasCoords ? (
                    <>
                      <div className="mt-2 h-[228px] overflow-hidden border border-border">
                        <PointMap
                          lat={animal.strandingLat as number}
                          lon={animal.strandingLon as number}
                          label={locationLabel}
                        />
                      </div>
                      <p className="mt-1.5 text-[13px] text-muted-foreground">
                        {[place, coords].filter(Boolean).join(" · ")}
                      </p>
                    </>
                  ) : (
                    <>
                      {place && <p className="mt-2">{place}</p>}
                      <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <MapPinOff className="size-4 shrink-0" />
                        {t("noCoordinates")}
                      </p>
                    </>
                  )}
                </section>
                <ResearchShare animal={animal} isOrgAdmin={isOrgAdmin} />
              </div>
            </div>
          )}

          {tab === "necropsy" && <NecropsyTab animalId={id} />}

          {tab === "biometry" && <BiometryTab animalId={id} />}

          {tab === "samples" && (
            <SamplesTab animalId={id} isOrgAdmin={isOrgAdmin} selfId={selfId} researches={owners} />
          )}

          {tab === "analyses" && <AnalysesTab animalId={id} />}

          {tab === "media" && (
            <MediaTab animalId={id} isOrgAdmin={isOrgAdmin} selfId={selfId} researches={owners} />
          )}

          {tab === "audit" && <AuditTab animalId={id} />}
        </div>
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
