import { useState } from "react"

export type SortDir = "asc" | "desc"
export type SortState = { key: string; dir: SortDir } | null

/**
 * Controla busca textual (em todas as colunas) + ordenação clicável por coluna
 * para tabelas client-side pequenas (listas administrativas / catálogos).
 *
 * - `columns`: mapa chave -> acessor usado para ordenar aquela coluna.
 * - `search`: texto concatenado de todas as colunas usado no filtro (case-insensitive).
 * - Clicar numa coluna alterna asc -> desc; clicar em outra recomeça em asc.
 */
export function useTable<T>(
  rows: T[],
  opts: {
    columns: Record<string, (row: T) => string | number>
    search: (row: T) => string
    locale?: string
    initialSort?: { key: string; dir?: SortDir }
    /** Ao mudar (ex.: troca de aba), reinicia busca e ordenação para o estado inicial. */
    resetKey?: string
  }
) {
  const initial: SortState = opts.initialSort
    ? { key: opts.initialSort.key, dir: opts.initialSort.dir ?? "asc" }
    : null
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortState>(initial)

  // Padrão React "ajustar estado ao mudar prop": reseta ao trocar de resetKey.
  const [prevReset, setPrevReset] = useState(opts.resetKey)
  if (opts.resetKey !== prevReset) {
    setPrevReset(opts.resetKey)
    setQuery("")
    setSort(initial)
  }

  function toggleSort(key: string) {
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    )
  }

  const q = query.trim().toLowerCase()
  let out = q ? rows.filter((r) => opts.search(r).toLowerCase().includes(q)) : rows.slice()

  if (sort && opts.columns[sort.key]) {
    const accessor = opts.columns[sort.key]
    out = out.slice().sort((a, b) => {
      const av = accessor(a)
      const bv = accessor(b)
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), opts.locale, { numeric: true, sensitivity: "base" })
      return sort.dir === "asc" ? cmp : -cmp
    })
  }

  return { query, setQuery, sort, toggleSort, rows: out }
}
