"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Trunca o conteúdo em UMA linha com reticências e expõe o texto completo num tooltip nativo
// (atributo `title`) — mas só quando o texto está realmente cortado. Mantém as linhas das
// tabelas com altura uniforme (nada de quebra em várias linhas).
//
// A largura máxima vem de `max-w-*` no `className` (padrão: 16rem). Em tabelas com layout
// automático, é o `max-width` deste elemento interno que faz o truncamento funcionar e limita
// a largura da coluna.
export function Truncate({
  children,
  className,
  title,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [tip, setTip] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      const overflowing = el.scrollWidth > el.clientWidth + 1
      setTip(overflowing ? (title ?? el.textContent ?? undefined) : undefined)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children, title])

  return (
    <span
      ref={ref}
      className={cn("block max-w-[16rem] truncate", className)}
      title={tip}
      {...props}
    >
      {children}
    </span>
  )
}
