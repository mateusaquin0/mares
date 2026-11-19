import * as React from "react"

import { cn } from "@/lib/utils"

// `density="compact"` é para tabelas de dados de laboratório (resultados, análises), onde
// cabem mais linhas por tela; as demais listas ficam no padrão.
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { density?: "default" | "compact" }
>(({ className, density = "default", ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      data-density={density}
      className={cn("group/table w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "border-t-2 border-foreground [&_tr]:border-b [&_tr]:border-foreground [&_tr]:hover:bg-transparent",
      className,
    )}
    {...props}
  />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t border-foreground font-semibold [&>tr]:last:border-b-0", className)}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors hover:bg-accent/60 data-[state=selected]:bg-accent",
        className,
      )}
      {...props}
    />
  ),
)
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-8 px-3 text-left align-middle text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground group-data-[density=compact]/table:px-2 [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "break-words px-3 py-[7px] align-middle group-data-[density=compact]/table:px-2 group-data-[density=compact]/table:py-1 [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

// Linha de estado vazio: mantém o corpo da tabela visível e mostra uma mensagem
// centralizada, ocupando todas as colunas. Use dentro de <TableBody> quando a lista
// (base ou filtrada) estiver vazia.
const TableEmpty = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & { colSpan: number }
>(({ className, colSpan, children, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn("!border-b border-foreground hover:bg-transparent", className)}
    {...props}
  >
    <td
      colSpan={colSpan}
      className="px-3 py-4 text-left font-serif text-[17px] leading-6 text-foreground group-data-[density=compact]/table:px-2"
    >
      {children}
    </td>
  </tr>
))
TableEmpty.displayName = "TableEmpty"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-2 text-left text-[13px] text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TableEmpty,
}
