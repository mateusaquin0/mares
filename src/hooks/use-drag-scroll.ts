// MARES — "Arrastar para rolar" (click-and-drag) num contêiner rolável.
//
// Retorna uma ref callback: anexe-a ao elemento cujo scroll deve ser arrastado. Quando o
// elemento anexado NÃO é o próprio contêiner de rolagem — caso da <table> do componente
// ui/Table, que embrulha a tabela numa div `overflow-auto` — passe `resolve` para apontar o
// contêiner correto (ex.: `(table) => table.parentElement`).

import { useCallback, useRef } from "react"

// Limiar em px para diferenciar um clique de um arrasto (preserva cliques em links/botões).
const DRAG_THRESHOLD = 3

export function useDragScroll<T extends HTMLElement>(resolve?: (node: T) => HTMLElement | null) {
  // Guarda `resolve` numa ref para manter a ref callback estável (deps vazias) mesmo quando o
  // chamador passa uma arrow inline.
  const resolveRef = useRef(resolve)
  resolveRef.current = resolve
  const cleanupRef = useRef<(() => void) | null>(null)

  return useCallback((node: T | null) => {
    // Troca de nó / desmontagem: desfaz os listeners anteriores.
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!node) return
    const el = resolveRef.current ? resolveRef.current(node) : node
    if (!el) return

    let down = false
    let dragging = false
    let startX = 0
    let startY = 0
    let startLeft = 0
    let startTop = 0

    const onDown = (e: MouseEvent) => {
      // Só botão esquerdo; ignora alvos interativos para não roubar cliques.
      if (e.button !== 0) return
      if (
        (e.target as HTMLElement).closest(
          "a, button, input, select, textarea, label, [role='button']",
        )
      )
        return
      down = true
      dragging = false
      startX = e.pageX
      startY = e.pageY
      startLeft = el.scrollLeft
      startTop = el.scrollTop
    }

    const onMove = (e: MouseEvent) => {
      if (!down) return
      const dx = e.pageX - startX
      const dy = e.pageY - startY
      if (!dragging && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
        dragging = true
        el.style.cursor = "grabbing"
        el.style.userSelect = "none"
      }
      if (dragging) {
        el.scrollLeft = startLeft - dx
        el.scrollTop = startTop - dy
        e.preventDefault()
      }
    }

    const onUp = () => {
      down = false
      dragging = false
      // Volta ao "grab" (mão aberta) — ainda dá para arrastar de novo.
      el.style.cursor = "grab"
      el.style.userSelect = ""
    }

    // Estilo inline: o Tailwind não varre este arquivo (fora do `content` do tailwind.config).
    el.style.cursor = "grab"
    el.addEventListener("mousedown", onDown)
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)

    cleanupRef.current = () => {
      el.style.cursor = ""
      el.style.userSelect = ""
      el.removeEventListener("mousedown", onDown)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])
}
