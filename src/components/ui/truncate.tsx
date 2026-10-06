"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Classes estáticas: o Tailwind varre o código-fonte, então `line-clamp-${n}` não geraria CSS.
const CLAMP: Record<number, string> = {
  2: "line-clamp-2",
  3: "line-clamp-3",
}

// Trunca o conteúdo com reticências e expõe o texto completo num tooltip nativo (atributo
// `title`) — mas só quando o texto está realmente cortado. `lines` permite quebrar em até N
// linhas antes de cortar (padrão: 1) e a largura máxima vem de `max-w-*` no `className`.
export function Truncate({
  children,
  className,
  title,
  lines = 1,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { lines?: 1 | 2 | 3 }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [tip, setTip] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      // Em uma linha o texto transborda na horizontal; com `line-clamp`, ele quebra e o que
      // sobra transborda na vertical.
      const overflowing =
        lines > 1 ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1
      setTip(overflowing ? (title ?? el.textContent ?? undefined) : undefined)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children, title, lines])

  return (
    <span
      ref={ref}
      // `line-clamp` já define o `display` (-webkit-box); emitir `block` junto deixaria a
      // precedência das duas regras a cargo da ordem do CSS.
      className={cn("max-w-[16rem]", lines > 1 ? CLAMP[lines] : "block truncate", className)}
      title={tip}
      {...props}
    >
      {children}
    </span>
  )
}
