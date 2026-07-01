"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Microscope } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type WormsMatch = {
  aphiaId: number
  scientificName: string
  rank: string | null
  status: string | null
  family: string | null
  order: string | null
}

// Botão que abre a busca no WoRMS; ao escolher um registro, chama onSelect com a taxonomia.
export function WormsSpeciesInput({ onSelect }: { onSelect: (m: WormsMatch) => void }) {
  const t = useTranslations("animals")
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<WormsMatch[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const q = query.trim()
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
  }, [query, open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="shrink-0">
          <Microscope className="size-4" />
          {t("wormsSearch")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("wormsPlaceholder")}
          />
          <CommandList>
            <CommandEmpty>
              {loading
                ? t("wormsSearching")
                : query.trim().length < 3
                  ? t("wormsHint")
                  : t("wormsEmpty")}
            </CommandEmpty>
            {results.length > 0 && (
              <CommandGroup>
                {results.map((m) => (
                  <CommandItem
                    key={m.aphiaId}
                    value={String(m.aphiaId)}
                    onSelect={() => {
                      onSelect(m)
                      setOpen(false)
                      setQuery("")
                    }}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate italic">{m.scientificName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[m.rank, m.family, m.order].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
