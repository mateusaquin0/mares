import type { CatalogRequestItem } from "@/types/catalog-request"
import { Truncate } from "@/components/ui/truncate"
import { cn } from "@/lib/utils"
import { requestItemName } from "./request-display"

// Patógeno com nome científico segue a grafia binomial (itálico); os demais itens são nomes comuns.
export function RequestItemName({
  locale,
  request,
}: {
  locale: string
  request: CatalogRequestItem
}) {
  const scientific = request.type === "PATHOGEN" && !!request.payload.scientificName
  return (
    <Truncate
      className={cn("max-w-full", scientific ? "font-serif text-base italic" : "font-semibold")}
    >
      {requestItemName(locale, request)}
    </Truncate>
  )
}
