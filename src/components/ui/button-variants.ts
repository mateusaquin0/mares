import { cva } from "class-variance-authority"

// Só as classes do botão, sem o Slot do Radix: dá para usar em Server Components.
export const buttonVariants = cva(
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
