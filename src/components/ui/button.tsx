import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
        destructive:
          "border-destructive bg-destructive font-semibold text-destructive-foreground hover:bg-destructive/90",
        outline: "border-input bg-transparent text-foreground hover:bg-accent",
        secondary: "border-input bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "border-transparent hover:bg-accent",
        link: "h-auto border-transparent px-0 text-primary underline underline-offset-2 hover:text-foreground",
      },
      size: {
        default: "h-[30px] px-3",
        sm: "h-7 px-2.5",
        // Páginas públicas: alvo de toque de 44px.
        lg: "h-11 px-5 text-[15px]",
        icon: "size-[30px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Exibe um spinner e desabilita o botão enquanto a ação é processada. */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button"
    // Com asChild o Slot exige um único filho — não injetamos o spinner nesse caso.
    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          disabled={disabled}
          {...props}
        >
          {children}
        </Comp>
      )
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden />}
        {children}
      </button>
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
