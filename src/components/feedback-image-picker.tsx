"use client"

import { useEffect, useMemo, useRef } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ImagePlus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  FEEDBACK_ATTACHMENT_ALLOWED,
  FEEDBACK_ATTACHMENT_MAX_BYTES,
  FEEDBACK_ATTACHMENT_MAX_PER_TICKET,
} from "@/lib/feedback-media"
import type { FeedbackNamespace } from "@/components/feedback-badges"

const MB = 1024 * 1024

// As três telas que anexam imagem — envio, "meus envios" e triagem — têm namespaces de
// i18n próprios, com as mesmas chaves `attach*`.
export type ImagePickerNamespace = FeedbackNamespace | "feedback"

type PickerProps = {
  files: File[]
  onChange: (files: File[]) => void
  ns: ImagePickerNamespace
}

/**
 * Miniaturas dos arquivos ainda NÃO enviados. Fica separada do botão de propósito: a grade
 * cresce conforme a seleção, e num mesmo `flex` ela empurraria o botão (e o texto ao lado)
 * para fora da linha. Quem chama põe as miniaturas acima e o controle abaixo.
 */
export function FeedbackImagePreviews({ files, onChange, ns }: PickerProps) {
  const t = useTranslations(ns)

  // Miniaturas locais, revogadas quando a seleção muda ou o componente sai.
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  if (files.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <div
          key={`${f.name}-${i}`}
          className="relative size-20 shrink-0 overflow-hidden rounded-lg border bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previews[i]} alt={f.name} title={f.name} className="size-full object-cover" />
          <button
            type="button"
            title={t("removeAttachment")}
            onClick={() => onChange(files.filter((_, j) => j !== i))}
            className="absolute right-1 top-1 rounded-full bg-background/85 p-0.5 text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="size-3.5" />
            <span className="sr-only">{t("removeAttachment")}</span>
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * Botão de anexar + os tipos aceitos, na MESMA linha: o texto é legenda do botão, não um
 * irmão solto — junto, o par alinha sozinho em qualquer contexto.
 * Tipo e tamanho são conferidos aqui só para dar retorno imediato; quem decide é o servidor,
 * que ignora o MIME declarado e olha os magic bytes do arquivo.
 */
export function FeedbackImagePicker({
  files,
  onChange,
  remaining,
  ns,
  disabled,
}: PickerProps & {
  // Quantas imagens ainda cabem no ticket (teto por ticket, somando os dois lados).
  remaining: number
  disabled?: boolean
}) {
  const t = useTranslations(ns)
  const inputRef = useRef<HTMLInputElement>(null)
  const atLimit = remaining <= 0

  function pick(picked: FileList | null) {
    if (!picked) return
    const accepted: File[] = []
    for (const file of Array.from(picked)) {
      if (!FEEDBACK_ATTACHMENT_ALLOWED.includes(file.type)) {
        toast.error(t("attachInvalid"))
        continue
      }
      if (file.size > FEEDBACK_ATTACHMENT_MAX_BYTES) {
        toast.error(t("attachTooLarge", { max: FEEDBACK_ATTACHMENT_MAX_BYTES / MB }))
        continue
      }
      if (accepted.length >= remaining) {
        toast.error(t("attachLimit", { max: FEEDBACK_ATTACHMENT_MAX_PER_TICKET }))
        break
      }
      accepted.push(file)
    }
    if (accepted.length) onChange([...files, ...accepted])
    // Permite reescolher o MESMO arquivo depois de removê-lo da lista.
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={FEEDBACK_ATTACHMENT_ALLOWED.join(",")}
        multiple
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
      {/* O `title` fica no wrapper, não no botão: botão desabilitado não dispara hover, e
          sem isso a pessoa não descobre POR QUE não consegue mais anexar. */}
      <span
        className="shrink-0"
        title={atLimit ? t("attachLimit", { max: FEEDBACK_ATTACHMENT_MAX_PER_TICKET }) : undefined}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={disabled || atLimit}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="size-4" />
          {t("attach")}
        </Button>
      </span>
      <span className="min-w-0 text-[11px] leading-tight text-muted-foreground">
        {t("attachHint", { max: FEEDBACK_ATTACHMENT_MAX_BYTES / MB })}
      </span>
    </div>
  )
}
