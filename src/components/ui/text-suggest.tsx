"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

// Quantas sugestões aparecem de uma vez. Com poucas opções visíveis a lista não precisa de
// rolagem própria (que não funciona bem em popover portalado dentro de diálogo) e continua
// mais rápida de ler do que de rolar — digitar mais um caractere afunila melhor.
const MAX_VISIBLE = 8

// Campo de texto LIVRE com sugestões: o usuário digita o que quiser e a lista apenas
// oferece atalhos para valores já usados. Diferente do Combobox, que só aceita valores da
// lista.
export function TextSuggest({
  id,
  name,
  value,
  onChange,
  suggestions,
  placeholder,
  maxLength,
  disabled,
  "aria-invalid": ariaInvalid,
  className,
}: {
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  maxLength?: number
  disabled?: boolean
  "aria-invalid"?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(-1)
  const listId = React.useId()
  const inputRef = React.useRef<HTMLInputElement>(null)

  const matches = React.useMemo(() => {
    const q = value.trim().toLowerCase()
    const pool = q ? suggestions.filter((s) => s.toLowerCase().includes(q)) : suggestions
    // Um item idêntico ao que já está digitado não é atalho para nada.
    return pool.filter((s) => s.toLowerCase() !== q).slice(0, MAX_VISIBLE)
  }, [suggestions, value])

  // Fecha sozinho quando o filtro zera as sugestões. O destaque volta ao início a cada
  // mudança da lista: a posição de antes apontaria para outro item.
  React.useEffect(() => {
    if (matches.length === 0) setOpen(false)
    setActive(-1)
  }, [matches])

  const pick = (option: string) => {
    onChange(option)
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (open) {
        e.stopPropagation() // não fecha o diálogo em volta: primeiro Esc fecha só a lista
        setOpen(false)
      }
      return
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (matches.length === 0) return
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(e.key === "ArrowDown" ? 0 : matches.length - 1)
        return
      }
      const step = e.key === "ArrowDown" ? 1 : -1
      setActive((i) => (i + step + matches.length) % matches.length)
      return
    }
    // Enter com sugestão destacada escolhe a sugestão em vez de enviar o formulário.
    if (e.key === "Enter" && open && active >= 0 && matches[active]) {
      e.preventDefault()
      pick(matches[active])
    }
  }

  return (
    <Popover open={open && matches.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          id={id}
          name={name}
          // O autocomplete do navegador competiria com esta lista pelo mesmo espaço.
          autoComplete="off"
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={ariaInvalid}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          className={className}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          // Clicar reabre: depois de escolher um item ou fechar com Esc o campo continua
          // focado, e sem isso só voltar a digitar traria as sugestões de volta.
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </PopoverAnchor>
      <PopoverContent
        id={listId}
        role="listbox"
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] p-1"
        // O foco permanece no input: a lista é um auxílio à digitação, não um destino.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // O input é âncora, não gatilho: para o Radix ele fica FORA da lista, e tanto o
        // clique quanto o foco nele contariam como "interação externa" que a dispensa.
        // O foco é o caso crítico: o Radix escuta `focusin` no documento sem adiar a
        // inscrição (ao contrário do `pointerdown`), então o próprio foco que abriu a lista
        // ainda está subindo a árvore quando o listener entra — e a fecharia na hora.
        onInteractOutside={(e) => {
          if (e.target === inputRef.current) e.preventDefault()
        }}
      >
        {matches.map((option, i) => (
          <button
            key={option}
            type="button"
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            // mousedown dispararia o blur do input antes do clique registrar.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(option)}
            onMouseEnter={() => setActive(i)}
            className={cn(
              "block w-full truncate rounded-sm px-2 py-1.5 text-left text-sm",
              i === active && "bg-accent text-accent-foreground",
            )}
          >
            {option}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
