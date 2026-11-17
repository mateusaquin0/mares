"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme()
  return (
    <Sonner
      theme={(theme as ToasterProps["theme"]) ?? "system"}
      className="toaster group"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group toast flex w-[380px] max-w-[calc(100vw-32px)] items-start gap-2.5 rounded-sm border border-foreground bg-popover px-3 py-2.5 font-sans text-sm text-foreground shadow-menu",
          title: "font-semibold",
          description: "text-muted-foreground",
          icon: "mt-px [&_svg]:size-[18px]",
          success: "border-positive [&_[data-icon]]:text-positive",
          error: "border-destructive [&_[data-icon]]:text-destructive",
          warning: "border-warning [&_[data-icon]]:text-warning",
          info: "border-info [&_[data-icon]]:text-info",
          actionButton:
            "ml-auto h-7 shrink-0 rounded-sm border border-primary bg-primary px-2.5 font-semibold text-primary-foreground",
          cancelButton: "h-7 shrink-0 rounded-sm border border-input px-2.5",
        },
      }}
      {...props}
    />
  )
}
