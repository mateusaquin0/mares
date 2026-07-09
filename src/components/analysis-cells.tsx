"use client"

import { useTranslations } from "next-intl"

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

// Cores dos marcadores de resultado, compartilhadas entre o seletor, a legenda e a grade
// de resultados. Mantêm a convenção do app: verde = positivo, laranja = inconclusivo,
// cinza = negativo. "Não testado" é um anel vazio (distingue de negativo preenchido).
export const RESULT_DOT: Record<string, string> = {
  POSITIVO: "bg-[hsl(123_41%_45%)]",
  NEGATIVO: "bg-muted-foreground/40",
  INCONCLUSIVO: "bg-[hsl(35_80%_50%)]",
}

// Marcador circular de um resultado (ou anel vazio quando não testado). `size` em unidades tw.
export function ResultDot({
  result,
  className = "",
}: {
  result: ResultValue | null
  className?: string
}) {
  if (!result)
    return (
      <span
        className={`inline-block size-2.5 rounded-full border border-muted-foreground/30 ${className}`}
      />
    )
  return (
    <span className={`inline-block size-2.5 rounded-full ${RESULT_DOT[result]} ${className}`} />
  )
}

// Seletor de resultado (POSITIVO/NEGATIVO/INCONCLUSIVO/não testado) com marcadores coloridos.
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
  return (
    <Select
      value={value ?? UNTESTED}
      onValueChange={(v) => onChange(v === UNTESTED ? null : (v as ResultValue))}
      disabled={disabled}
    >
      <SelectTrigger className="h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNTESTED}>{t("resultUntested")}</SelectItem>
        <SelectItem value="POSITIVO">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[hsl(123_41%_45%)]" />
            {t("resultPositive")}
          </span>
        </SelectItem>
        <SelectItem value="NEGATIVO">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-muted-foreground/40" />
            {t("resultNegative")}
          </span>
        </SelectItem>
        <SelectItem value="INCONCLUSIVO">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[hsl(35_80%_50%)]" />
            {t("resultInconclusive")}
          </span>
        </SelectItem>
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
  disabled = false,
}: {
  value: number | null
  placeholder: string
  unit: string | null
  onCommit: (n: number | null) => void
  disabled?: boolean
}) {
  const input = (
    <Input
      key={value ?? ""}
      defaultValue={value ?? ""}
      type="number"
      step="any"
      placeholder={placeholder}
      title={placeholder}
      className="h-8"
      disabled={disabled}
      onBlur={(e) => {
        const raw = e.target.value.trim()
        onCommit(raw === "" ? null : Number(raw))
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
  disabled = false,
}: {
  value: string | null
  placeholder: string
  onCommit: (s: string | null) => void
  disabled?: boolean
}) {
  return (
    <Input
      key={value ?? ""}
      defaultValue={value ?? ""}
      placeholder={placeholder}
      className="h-8"
      disabled={disabled}
      onBlur={(e) => {
        const raw = e.target.value.trim()
        onCommit(raw === "" ? null : raw)
      }}
    />
  )
}
