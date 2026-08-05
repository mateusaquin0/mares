"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

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

export type MultiSelectOption = { value: string; label: string; icon?: React.ReactNode }

// Combobox de múltipla seleção (Popover + Command com checkboxes). Controlado por um array de
// valores. O gatilho mostra os rótulos selecionados (truncados); vazio mostra o placeholder.
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  triggerClassName,
  searchable = true,
  summary: summaryFn,
}: {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
  searchPlaceholder?: string
  emptyText: string
  triggerClassName?: string
  searchable?: boolean
  // Rótulo do gatilho quando há seleção. Padrão: os rótulos selecionados unidos por vírgula.
  // Passe, por ex., `(n) => t("summary", { count: n })` para exibir a contagem em vez das labels.
  summary?: (count: number) => string
}) {
  const [open, setOpen] = React.useState(false)

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  const selectedLabels = options.filter((o) => value.includes(o.value)).map((o) => o.label)
  const summary =
    value.length === 0
      ? placeholder
      : summaryFn
        ? summaryFn(value.length)
        : selectedLabels.join(", ")

  return (
    // `modal` para o popover assumir o lock de rolagem dentro de Dialogs (ver Combobox).
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 w-full justify-between font-normal", triggerClassName)}
        >
          <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
            {summary}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {!summaryFn && value.length > 1 && (
              <span className="rounded bg-accent px-1.5 text-xs font-medium tabular-nums text-accent-foreground">
                {value.length}
              </span>
            )}
            <ChevronsUpDown className="size-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-52 p-0" align="start">
        <Command>
          {searchable && <CommandInput placeholder={searchPlaceholder ?? placeholder} />}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const checked = value.includes(o.value)
                return (
                  <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
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
