"use client"

import { useEffect, useState, type RefObject } from "react"

// O Leaflet não sobrevive a ser montado num container sem área (ex.: dentro de uma seção
// `display:none`): a camada de calor cria um canvas de largura 0 e o `getImageData` estoura.
// Os mapas só inicializam quando este hook confirma que há espaço — e reinicializam se o
// container voltar a ter tamanho.
export function useHasSize(ref: RefObject<HTMLElement | null>) {
  const [hasSize, setHasSize] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setHasSize(el.clientWidth > 0 && el.clientHeight > 0)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return hasSize
}
