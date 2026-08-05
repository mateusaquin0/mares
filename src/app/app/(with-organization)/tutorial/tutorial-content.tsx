"use client"

import { useTranslations } from "next-intl"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

// Tópicos na ordem do fluxo padrão da aplicação. O conteúdo vive no i18n (namespace
// `tutorial.sections`): cada tópico tem `title`, `body` e uma lista `points`.
const SECTIONS = [
  "overview",
  "access",
  "group",
  "glossary",
  "research",
  "animal",
  "sharing",
  "samples",
  "analyses",
  "history",
  "map",
  "export",
] as const

export function TutorialContent() {
  const t = useTranslations("tutorial")

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Accordion type="single" collapsible defaultValue="overview" className="space-y-2">
        {SECTIONS.map((id) => {
          const points = t.raw(`sections.${id}.points`) as string[]
          return (
            <AccordionItem key={id} value={id} className="bg-card shadow-card">
              <AccordionTrigger>{t(`sections.${id}.title`)}</AccordionTrigger>
              <AccordionContent className="space-y-2 text-muted-foreground">
                <p>{t(`sections.${id}.body`)}</p>
                {points.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5">
                    {points.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}
