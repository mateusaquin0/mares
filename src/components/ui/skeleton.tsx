import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("bg-muted", className)} {...props} />
}

/**
 * Placeholder para listas/tabelas enquanto os dados carregam.
 */
function TableSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div aria-busy="true" className={cn("border-t-2 border-foreground", className)}>
      <div className="h-8 border-b border-foreground" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-[34px] items-center gap-6 border-b px-3">
          <Skeleton className="h-2.5 w-1/4" />
          <Skeleton className="h-2.5 w-1/5" />
          <Skeleton className="ml-auto h-2.5 w-16" />
        </div>
      ))}
    </div>
  )
}

export { Skeleton, TableSkeleton }
