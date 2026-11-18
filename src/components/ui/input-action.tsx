"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Button, type ButtonProps } from "@/components/ui/button"

// Campo com um botão de ícone dentro, à direita (lupa, "sem informação"). O campo ganha
// recuo à direita para o texto não passar por baixo do botão.
export function InputWithAction({
  action,
  className,
  children,
}: {
  action: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("relative [&_input]:pr-8", className)}>
      {children}
      <div className="absolute inset-y-0 right-1 flex items-center">{action}</div>
    </div>
  )
}

export const InputActionButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "size-6 text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:text-destructive [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  ),
)
InputActionButton.displayName = "InputActionButton"
