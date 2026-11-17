import * as React from "react"

import { cn } from "@/lib/utils"

// Seção do caderno: título em serifa entre uma borda de 2px em cima e uma de 1px embaixo.
const SectionTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" }
>(({ className, as: Tag = "h2", ...props }, ref) => (
  <Tag
    ref={ref}
    className={cn(
      "flex items-center gap-2 border-b border-t-2 border-foreground py-1.5 font-serif text-[17px] font-semibold leading-[22px]",
      className,
    )}
    {...props}
  />
))
SectionTitle.displayName = "SectionTitle"

// Linha rótulo/valor separada por uma linha fina. `labelWidth` é a largura da coluna do
// rótulo (ex.: "44%").
function DataRow({
  label,
  children,
  action,
  labelWidth = "44%",
  title,
  className,
}: {
  label: React.ReactNode
  children: React.ReactNode
  action?: React.ReactNode
  labelWidth?: string
  title?: string
  className?: string
}) {
  return (
    <div
      className={cn("grid items-start gap-3 border-b border-border py-[5px]", className)}
      style={{
        gridTemplateColumns: action
          ? `${labelWidth} minmax(0,1fr) auto`
          : `${labelWidth} minmax(0,1fr)`,
      }}
    >
      <dt className="text-muted-foreground" title={title}>
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
      {action}
    </div>
  )
}

export { SectionTitle, DataRow }
