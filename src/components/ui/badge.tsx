import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        // Variantes semânticas do design MARES (ver design.md §Chips/Badges).
        public: "border-transparent bg-accent text-accent-foreground",
        private: "border-transparent bg-primary/10 text-primary",
        positive: "border-success-border bg-success-soft text-success",
        negative: "border-transparent bg-secondary text-muted-foreground",
        inconclusive: "border-warning-border bg-warning-soft text-warning",
        // Níveis de ênfase: estado ativo em destaque e estado encerrado.
        highlight: "border-transparent bg-accent text-accent-foreground",
        faded: "border-dashed border-border bg-muted text-muted-foreground",
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
