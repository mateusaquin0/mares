"use client"

import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronRight } from "lucide-react"
import { useTranslations } from "next-intl"

import { AccordionContent } from "@/components/ui/accordion"

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
  "necropsy",
  "samples",
  "analyses",
  "history",
  "map",
  "export",
] as const

export function TutorialContent() {
  const t = useTranslations("tutorial")

  return (
    <div className="px-page pb-8 pt-3.5">
      <div className="max-w-[820px]">
        <h1 className="font-serif text-[28px] font-medium leading-8">{t("title")}</h1>
        <p className="mb-3 mt-0.5 text-pretty text-muted-foreground">{t("subtitle")}</p>

        <AccordionPrimitive.Root
          type="single"
          collapsible
          defaultValue="overview"
          className="border-t-2 border-foreground"
        >
          {SECTIONS.map((id) => {
            const points = t.raw(`sections.${id}.points`) as string[]
            return (
              <AccordionPrimitive.Item key={id} value={id} className="border-b border-border">
                <AccordionPrimitive.Header className="flex">
                  <AccordionPrimitive.Trigger className="group flex min-h-[38px] flex-1 items-center gap-2.5 text-left outline-none hover:text-primary focus-visible:bg-accent">
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                    <span className="font-serif text-lg font-medium">
                      {t(`sections.${id}.title`)}
                    </span>
                  </AccordionPrimitive.Trigger>
                </AccordionPrimitive.Header>
                <AccordionContent className="pb-3 pl-6 pt-0 text-[15px] leading-[23px]">
                  <p className="text-pretty">{t(`sections.${id}.body`)}</p>
                  {points.length > 0 && (
                    <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5">
                      {points.map((p, i) => (
                        <li key={i} className="text-pretty">
                          {p}
                        </li>
                      ))}
                    </ul>
                  )}
                </AccordionContent>
              </AccordionPrimitive.Item>
            )
          })}
        </AccordionPrimitive.Root>
      </div>
    </div>
  )
}
