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

export type ComboboxOption = { value: string; label: string; icon?: React.ReactNode }

// Combobox pesquisável (Popover + Command). Genérico e reutilizável.
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  emptyAction,
  disabled,
  loading,
}: {
  options: ComboboxOption[]
  value?: string
  onChange: (value: string) => void
  placeholder: string
  searchPlaceholder: string
  emptyText: string
  // Conteúdo extra renderizado no estado vazio (ex.: link para cadastrar o item em outra tela).
  emptyAction?: React.ReactNode
  disabled?: boolean
  loading?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    // `modal`: sem isso o popover não rola dentro de um Dialog — o conteúdo é portalado para
    // fora do "shard" do react-remove-scroll, que cancela o wheel (o Select já faz o mesmo).
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            {selected?.icon}
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? selected.label : placeholder}
            </span>
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
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                >
                  {o.icon}
                  <span className="truncate">{o.label}</span>
                  <Check
                    className={cn(
                      "ml-auto size-4",
                      value === o.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
