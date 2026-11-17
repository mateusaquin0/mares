"use client"

import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDown, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn("overflow-hidden border-t-2 border-foreground", className)}
    {...props}
  />
))
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex flex-1 items-center justify-between gap-2 py-2.5 text-left font-serif text-[17px] font-semibold leading-[22px] transition-colors hover:text-primary [&[data-state=open]>svg]:rotate-180",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
))
AccordionTrigger.displayName = "AccordionTrigger"

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-4 pt-1", className)}>{children}</div>
  </AccordionPrimitive.Content>
))
AccordionContent.displayName = "AccordionContent"

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }

// Gatilho de seção do caderno: seta à esquerda, título em serifa e, à direita, o resumo que a
// seção fechada continua mostrando. O item usa a borda de 2px do AccordionItem.
const AccordionSectionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  Omit<React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>, "children"> & {
    title: React.ReactNode
    summary?: React.ReactNode
  }
>(({ className, title, summary, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "group flex flex-1 items-baseline gap-3 border-b border-foreground py-[5px] text-left font-serif text-[17px] font-semibold leading-[22px] outline-none transition-colors hover:text-primary focus-visible:bg-accent",
        className,
      )}
      {...props}
    >
      <ChevronRight className="size-3.5 shrink-0 self-center text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
      <span className="flex-1">{title}</span>
      {summary != null && (
        <span className="font-sans text-[13px] font-normal text-muted-foreground">{summary}</span>
      )}
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
))
AccordionSectionTrigger.displayName = "AccordionSectionTrigger"

export { AccordionSectionTrigger }
