import * as React from "react"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { TableHead } from "@/components/ui/table"
import type { SortState } from "@/lib/use-table"

/** Cabeçalho de tabela clicável que alterna a ordenação (asc/desc) da coluna. */
export function SortableHead({
  sortKey,
  sort,
  onToggle,
  align = "left",
  className,
  children,
}: {
  sortKey: string
  sort: SortState
  onToggle: (key: string) => void
  align?: "left" | "right"
  className?: string
  children: React.ReactNode
}) {
  const active = sort?.key === sortKey
  const Icon = !active ? ChevronsUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown
  return (
    <TableHead
      aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "-mx-1 inline-flex max-w-full cursor-pointer items-center gap-1 rounded px-1 py-0.5 select-none transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="truncate">{children}</span>
        <Icon className={cn("size-3.5 shrink-0", !active && "opacity-50")} />
      </button>
    </TableHead>
  )
}
