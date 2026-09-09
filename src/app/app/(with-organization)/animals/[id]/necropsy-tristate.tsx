"use client"

import { useTranslations } from "next-intl"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Valor do Select que representa `null`: o Radix não aceita SelectItem com value="".
const UNKNOWN = "__unknown__"

const toValue = (v: boolean | null) => (v === null ? UNKNOWN : v ? "true" : "false")
const fromValue = (v: string) => (v === UNKNOWN ? null : v === "true")

// ── Tri-estado do laudo ──────────────────────────────────────────────────────
// "Não informado" (null) é um valor de verdade do laudo, não a ausência de resposta: dizer
// "não" afirma que se procurou e nada havia. Por isso os três são opções do mesmo select —
// um checkbox de dois estados apagaria a diferença.
//
// Módulo próprio porque duas telas o usam: os campos de parasita do achado macroscópico
// (necropsy-dialogs) e as perguntas da triagem da carcaça (necropsy-screening).
export function TriState({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: boolean | null
  onChange: (v: boolean | null) => void
  disabled?: boolean
}) {
  const t = useTranslations("necropsy")

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={toValue(value)}
        onValueChange={(v) => onChange(fromValue(v))}
        disabled={disabled}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">{t("yes")}</SelectItem>
          <SelectItem value="false">{t("no")}</SelectItem>
          <SelectItem value={UNKNOWN}>{t("notInformed")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
