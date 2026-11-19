import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Tela de estado do fluxo de acesso (solicitação enviada, e-mail enviado, link inválido):
// ícone na cor do status, título, explicação e as ações empilhadas.
export function AuthState({
  icon: Icon,
  tone,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  tone: "positive" | "destructive"
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Icon
        className={cn("mb-2.5 size-8", tone === "positive" ? "text-positive" : "text-destructive")}
        aria-hidden
      />
      <h1 className="font-serif text-[32px] font-medium leading-[38px]">{title}</h1>
      <p className="mt-1.5 text-pretty text-muted-foreground">{description}</p>
      <div className="mt-5 grid gap-3.5">{children}</div>
    </div>
  )
}
