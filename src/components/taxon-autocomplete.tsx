"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

// Sugestão taxonômica genérica (WoRMS, NCBI…). `id` é a chave da base de origem.
export type TaxonSuggestion = {
  id: number
  scientificName: string
  rank: string | null
  family: string | null
  order: string | null
}

// Campo de nome científico com busca taxonômica inline (≥3 letras). A fonte é injetada
// por `search`, então o mesmo componente serve para espécies (WoRMS) e patógenos (NCBI).
// Edição livre continua permitida — nesse caso `match` vem indefinido.
export function TaxonAutocomplete({
  id,
  value,
  onChange,
  search,
  searchingText,
  emptyText,
  invalid,
  className,
}: {
  id?: string
  value: string
  onChange: (name: string, match?: TaxonSuggestion) => void
  search: (q: string, opts: { signal: AbortSignal }) => Promise<TaxonSuggestion[]>
  searchingText: string
  emptyText: string
  invalid?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<TaxonSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Evita re-buscar (e reabrir) logo após uma seleção ou preenchimento automático.
  const skipSearch = useRef(false)

  // Posição do dropdown calculada a partir do input (para posicionamento fixo via portal).
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const updatePos = useCallback(() => {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [])

  // Recalcula a posição quando o dropdown abre e em scroll/resize (o dialog pode rolar).
  useLayoutEffect(() => {
    if (!open) return
    updatePos()
    // Usa capture para interceptar scroll em qualquer ancestral (ex.: DialogBody).
    window.addEventListener("scroll", updatePos, true)
    window.addEventListener("resize", updatePos)
    return () => {
      window.removeEventListener("scroll", updatePos, true)
      window.removeEventListener("resize", updatePos)
    }
  }, [open, updatePos])

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false
      return
    }
    const q = value.trim()
    if (q.length < 3) {
      setResults([])
      return
    }
    setLoading(true)
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        setResults(await search(q, { signal: ctrl.signal }))
      } catch {
        // abortado ou falha de rede — ignora
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [value, search])

  // Fecha o dropdown ao clicar fora (inclui o portal).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node
      if (
        boxRef.current &&
        !boxRef.current.contains(target) &&
        listRef.current &&
        !listRef.current.contains(target)
      )
        setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  function pick(m: TaxonSuggestion) {
    skipSearch.current = true
    onChange(m.scientificName, m)
    setResults([])
    setOpen(false)
  }

  const showList = open && value.trim().length >= 3

  return (
    <div ref={boxRef} className="relative">
      <Input
        ref={inputRef}
        id={id}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        className={cn("italic", className)}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {showList &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            className="fixed z-[100] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {loading ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">{searchingText}</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</p>
            ) : (
              <ul className="max-h-64 overflow-auto py-1">
                {results.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => pick(m)}
                      className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-accent"
                    >
                      <span className="truncate italic">{m.scientificName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[m.rank, m.family, m.order].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
