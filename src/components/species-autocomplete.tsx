"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

export type WormsMatch = {
  aphiaId: number
  scientificName: string
  rank: string | null
  status: string | null
  family: string | null
  order: string | null
}

// Campo de espécie com busca nativa no WoRMS: ao digitar (≥3 letras) sugere espécies
// inline; ao escolher, devolve a taxonomia. Edição livre continua permitida (espécie
// fora do WoRMS) — nesse caso `match` vem indefinido e o AphiaID deve ser desvinculado.
export function SpeciesAutocomplete({
  id,
  value,
  onChange,
  className,
}: {
  id?: string
  value: string
  onChange: (species: string, match?: WormsMatch) => void
  className?: string
}) {
  const t = useTranslations("animals")
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<WormsMatch[]>([])
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  // Evita re-buscar (e reabrir) logo após uma seleção ou preenchimento automático.
  const skipSearch = useRef(false)

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
        const res = await fetch(`/api/worms?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        setResults(res.ok ? await res.json() : [])
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
  }, [value])

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  function pick(m: WormsMatch) {
    skipSearch.current = true
    onChange(m.scientificName, m)
    setResults([])
    setOpen(false)
  }

  const showList = open && value.trim().length >= 3

  return (
    <div ref={boxRef} className="relative">
      <Input
        id={id}
        autoComplete="off"
        className={cn("italic", className)}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {showList && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          {loading ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">{t("wormsSearching")}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">{t("wormsEmpty")}</p>
          ) : (
            <ul className="max-h-64 overflow-auto py-1">
              {results.map((m) => (
                <li key={m.aphiaId}>
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
        </div>
      )}
    </div>
  )
}
