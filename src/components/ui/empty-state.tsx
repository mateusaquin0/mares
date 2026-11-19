import * as React from "react"

import { cn } from "@/lib/utils"

// Estado vazio: a mensagem ocupa o lugar das linhas, alinhada à esquerda, sem ilustração.
export function EmptyState({
  title,
  description,
  children,
  bordered = true,
  muted = false,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  bordered?: boolean
  // Mensagem longa, explicativa: sai em texto pequeno, sem o título em serifa.
  muted?: boolean
  className?: string
}) {
  return (
    <div className={cn("py-4", bordered && "border-b border-foreground", className)}>
      {muted ? (
        <EmptyDescription className="mt-0">{title}</EmptyDescription>
      ) : (
        <EmptyTitle>{title}</EmptyTitle>
      )}
      {description && <EmptyDescription>{description}</EmptyDescription>}
      {children && <div className="mt-2.5">{children}</div>}
    </div>
  )
}

export function EmptyTitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-pretty font-serif text-[17px] leading-6 text-foreground", className)}
      {...props}
    />
  )
}

export function EmptyDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("mt-1 max-w-[560px] text-pretty text-[13px] text-muted-foreground", className)}
      {...props}
    />
  )
}
