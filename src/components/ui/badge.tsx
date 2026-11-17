import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-sm border px-[7px] text-[13px] font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground",
        secondary: "border-input bg-transparent text-foreground",
        destructive: "border-destructive bg-destructive-subtle text-destructive",
        outline: "border-input text-muted-foreground",
        // Publicação no mapa público: publicado é informativo; não publicado é neutro.
        public: "border-info bg-info-subtle text-info",
        private: "border-input bg-transparent text-muted-foreground",
        // Resultados: positivo e inconclusivo têm cor; negativo é neutro.
        positive: "border-positive bg-positive-subtle text-positive",
        negative: "border-input bg-transparent text-muted-foreground",
        inconclusive: "border-warning bg-warning-subtle text-warning",
        warning: "border-warning bg-warning-subtle text-warning",
        info: "border-info bg-info-subtle text-info",
        // Níveis de ênfase: estado ativo em destaque e estado encerrado.
        highlight: "border-primary bg-accent text-foreground",
        faded: "border-dashed border-input bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
