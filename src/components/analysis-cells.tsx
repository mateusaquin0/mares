"use client"

import { useTranslations } from "next-intl"
import { CircleDashed, CircleHelp, CircleMinus, CirclePlus, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

import type { ResultValue } from "@/types/analysis"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const UNTESTED = "UNTESTED"

// Ícone e tom de cada resultado: cor só para positivo e inconclusivo; negativo é neutro.
export const RESULT_META: Record<
  ResultValue | typeof UNTESTED,
  { icon: LucideIcon; labelKey: string; trigger: string }
> = {
  POSITIVO: {
    icon: CirclePlus,
    labelKey: "resultPositive",
    trigger: "border-positive bg-positive-subtle font-semibold text-positive",
  },
  NEGATIVO: { icon: CircleMinus, labelKey: "resultNegative", trigger: "font-semibold" },
  INCONCLUSIVO: {
    icon: CircleHelp,
    labelKey: "resultInconclusive",
    trigger: "border-warning bg-warning-subtle font-semibold text-warning",
  },
  [UNTESTED]: { icon: CircleDashed, labelKey: "resultUntested", trigger: "text-muted-foreground" },
}

// Seletor de resultado (POSITIVO/NEGATIVO/INCONCLUSIVO/não testado).
// Compartilhado entre a aba de análises do animal e a tela de resultados por pesquisa.
export function ResultSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: ResultValue | null
  onChange: (v: ResultValue | null) => void
  disabled?: boolean
}) {
  const t = useTranslations("analyses")
  const current = RESULT_META[value ?? UNTESTED]
  return (
    <Select
      value={value ?? UNTESTED}
      onValueChange={(v) => onChange(v === UNTESTED ? null : (v as ResultValue))}
      disabled={disabled}
    >
      <SelectTrigger className={cn("h-[26px] px-1.5", current.trigger)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {([UNTESTED, "POSITIVO", "NEGATIVO", "INCONCLUSIVO"] as const).map((v) => {
          const meta = RESULT_META[v]
          const Icon = meta.icon
          return (
            <SelectItem key={v} value={v}>
              <span className="flex items-center gap-1.5">
                <Icon className="size-3.5 shrink-0" aria-hidden />
                {t(meta.labelKey)}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

// Inputs não controlados que só disparam save no blur (evita PUT a cada tecla).
// O rótulo da medida (Ct, Título, OD...) vem do próprio exame como placeholder; a unidade
// opcional é exibida como sufixo.
export function MeasureInput({
  value,
  placeholder,
  unit,
  onCommit,
  resetKey = 0,
  disabled = false,
}: {
  value: number | null
  placeholder: string
  unit: string | null
  onCommit: (n: number | null) => void
  // Força o remonte do input para descartar o que foi digitado (usado quando o usuário
  // cancela a remoção do lançamento): o valor exibido volta a ser `value`.
  resetKey?: number
  disabled?: boolean
}) {
  const input = (
    <Input
      key={`${value ?? ""}|${resetKey}`}
      defaultValue={value ?? ""}
      type="number"
      step="any"
      placeholder={placeholder}
      title={placeholder}
      className="h-[26px] px-1.5 text-right tabular-nums"
      disabled={disabled}
      onBlur={(e) => {
        const raw = e.target.value.trim()
        if (raw === "") return onCommit(null)
        const n = Number(raw)
        // Entrada inválida (o input devolve "" para número malformado, mas vírgula decimal e
        // colagem escapam): não commita. NaN viraria `null` no JSON e apagaria a medida.
        if (!Number.isFinite(n)) return
        onCommit(n)
      }}
    />
  )
  if (!unit) return input
  return (
    <div className="flex items-center gap-1.5">
      {input}
      <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>
    </div>
  )
}

export function NotesInput({
  value,
  placeholder,
  onCommit,
  resetKey = 0,
  disabled = false,
}: {
  value: string | null
  placeholder: string
  onCommit: (s: string | null) => void
  resetKey?: number
  disabled?: boolean
}) {
  return (
    <Input
      key={`${value ?? ""}|${resetKey}`}
      defaultValue={value ?? ""}
      placeholder={placeholder}
      className="h-[26px] px-1.5"
      disabled={disabled}
      onBlur={(e) => {
        const raw = e.target.value.trim()
        onCommit(raw === "" ? null : raw)
      }}
    />
  )
}

// Resultado lido (sem edição): ícone + rótulo, cor só em positivo e inconclusivo.
export function ResultMark({
  result,
  iconOnly = false,
  className,
}: {
  result: ResultValue | null
  iconOnly?: boolean
  className?: string
}) {
  const t = useTranslations("analyses")
  const meta = RESULT_META[result ?? UNTESTED]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        result === "POSITIVO" && "font-semibold text-positive",
        result === "INCONCLUSIVO" && "font-semibold text-warning",
        result === null && "text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className={iconOnly ? "sr-only" : undefined}>{t(meta.labelKey)}</span>
    </span>
  )
}
