"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
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
import type { ComboboxOption } from "@/components/ui/combobox"

// Combobox pesquisável de seleção MÚLTIPLA (Popover + Command). Mantém o dropdown aberto ao
// marcar/desmarcar itens; o resumo no gatilho mostra a contagem selecionada.
export function MultiCombobox({
  options,
  value,
  onChange,
  placeholder,
  summary,
  searchPlaceholder,
  emptyText,
  emptyAction,
  disabled,
  loading,
}: {
  options: ComboboxOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
  // Rótulo do gatilho quando há seleção (recebe a contagem). Ex.: (n) => `${n} selecionados`.
  summary: (count: number) => string
  searchPlaceholder: string
  emptyText: string
  emptyAction?: React.ReactNode
  disabled?: boolean
  loading?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const selectedSet = new Set(value)

  function toggle(v: string) {
    if (selectedSet.has(v)) onChange(value.filter((x) => x !== v))
    else onChange([...value, v])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
            {value.length === 0 ? placeholder : summary(value.length)}
          </span>
          {loading ? (
            <Loader2 className="size-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>
              <span className="block px-1">{emptyText}</span>
              {emptyAction && <div className="mt-2">{emptyAction}</div>}
            </CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const checked = selectedSet.has(o.value)
                return (
                  <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input",
                      )}
                    >
                      {checked && <Check className="size-3" />}
                    </span>
                    {o.icon}
                    <span className="truncate">{o.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
