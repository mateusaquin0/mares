"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { useErrorMessage } from "@/lib/use-error-message"
import {
  ANTHROPIC_INTERACTION_OPTIONS,
  INTERACTION_DEGREES,
  type AnthropicInteractionValue,
} from "@/lib/necropsy-enums"
import { useSetNecropsyScreening } from "@/hooks/use-necropsy"
import type { NecropsyScreening } from "@/types/necropsy"
import { TriState } from "./necropsy-tristate"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Grau atribuído ao marcar uma interação: a escala começa em 1, e exigir a escolha do grau
// antes de marcar transformaria em dois passos o que é uma resposta só ("houve interação
// com pesca").
const DEFAULT_DEGREE = 1

/**
 * Triagem da carcaça: interação antrópica (com os tipos encontrados e seus graus) e conteúdo
 * gastrointestinal.
 *
 * Grava a cada mudança, como o estado dos sistemas logo abaixo — são respostas de um clique,
 * e um botão "Salvar" por bloco criaria um rascunho que dá para fechar sem perceber. O bloco
 * viaja INTEIRO em cada PUT (ver setNecropsyScreeningSchema), então o corpo é sempre montado
 * a partir do próximo estado, e não do que a tela mostra no momento do clique.
 */
export function NecropsyScreeningSection({
  animalId,
  screening,
}: {
  animalId: string
  screening: NecropsyScreening
}) {
  const t = useTranslations("necropsy")
  const em = useErrorMessage()
  const saveM = useSetNecropsyScreening(animalId)
  const [form, setForm] = useState<NecropsyScreening>(screening)

  // O laudo é do indivíduo e mais de uma pesquisa o edita: quando o refetch traz outra
  // versão, a tela segue o servidor. Enquanto a gravação está no ar, não — senão o valor
  // recém-clicado piscaria de volta para o antigo.
  useEffect(() => {
    if (!saveM.isPending) setForm(screening)
  }, [screening, saveM.isPending])

  async function save(next: NecropsyScreening) {
    const previous = form
    setForm(next)
    try {
      await saveM.mutateAsync(next)
    } catch (err) {
      setForm(previous)
      toast.error(t("screeningError"), { description: em(err) })
    }
  }

  // Responder "não" (ou apagar a resposta) leva as interações junto: uma lista pendurada num
  // "não há indícios" seria contradição, e o servidor recusa o corpo nesse estado.
  const setAnthropic = (v: boolean | null) =>
    void save({
      ...form,
      anthropicInteraction: v,
      interactions: v === true ? form.interactions : [],
    })

  const degreeOf = (type: AnthropicInteractionValue) =>
    form.interactions.find((i) => i.type === type)?.degree ?? null

  const toggleInteraction = (type: AnthropicInteractionValue, checked: boolean) =>
    void save({
      ...form,
      interactions: checked
        ? [...form.interactions, { type, degree: DEFAULT_DEGREE }]
        : form.interactions.filter((i) => i.type !== type),
    })

  const setDegree = (type: AnthropicInteractionValue, degree: number) =>
    void save({
      ...form,
      interactions: form.interactions.map((i) => (i.type === type ? { ...i, degree } : i)),
    })

  return (
    // O título fica no gatilho do accordion (necropsy-tab); aqui só o corpo da seção.
    <div>
      <div className="mb-2.5 mt-1.5 flex flex-wrap items-start justify-between gap-4">
        <p className="text-[13px] text-muted-foreground">{t("screeningSubtitle")}</p>
        {saveM.isPending && (
          <span className="text-[13px] text-muted-foreground">{t("screeningSaving")}</span>
        )}
      </div>

      <div className="max-w-[360px]">
        <TriState
          id="anthropic-interaction"
          label={t("anthropicInteraction")}
          value={form.anthropicInteraction}
          onChange={setAnthropic}
        />
      </div>

      {/* A lista só existe depois do "sim": perguntar o tipo antes de saber se houve
          interação inverteria a ordem da triagem. */}
      {form.anthropicInteraction === true && (
        <fieldset className="mt-2.5 border border-l-2 border-border border-l-foreground px-3 pb-2.5 pt-2">
          <legend className="sr-only">{t("interactionsLabel")}</legend>
          <p
            aria-hidden
            className="text-xs font-bold uppercase tracking-[.05em] text-muted-foreground"
          >
            {t("interactionsLabel")}
          </p>
          <p className="text-[13px] text-muted-foreground">{t("interactionsHint")}</p>
          <div className="mt-1 grid grid-cols-2 gap-x-8">
            {ANTHROPIC_INTERACTION_OPTIONS.map((o) => {
              const degree = degreeOf(o.value)
              const checked = degree !== null
              return (
                <div
                  key={o.value}
                  className="flex min-h-[34px] items-center gap-2 border-b border-border"
                >
                  <Checkbox
                    id={`interaction-${o.value}`}
                    checked={checked}
                    onCheckedChange={(v) => toggleInteraction(o.value, v === true)}
                  />
                  <Label htmlFor={`interaction-${o.value}`} className="flex-1 text-sm font-normal">
                    {t(o.key)}
                  </Label>
                  {/* O grau só aparece no que está marcado: um seletor solto sugeriria que
                      existe grau para uma interação que não houve. */}
                  {checked && (
                    <Select
                      value={String(degree)}
                      onValueChange={(v) => setDegree(o.value, Number(v))}
                    >
                      <SelectTrigger
                        className="h-[26px] w-[104px]"
                        aria-label={t("interactionDegreeOf", { type: t(o.key) })}
                        title={t("interactionDegreeOf", { type: t(o.key) })}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INTERACTION_DEGREES.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {t("degreeValue", { degree: d })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-3 grid grid-cols-3 gap-x-6 gap-y-3 border-t border-border pt-2.5">
        <TriState
          id="gi-content-collected"
          label={t("giContentCollected")}
          value={form.giContentCollected}
          onChange={(v) => void save({ ...form, giContentCollected: v })}
        />
        <TriState
          id="gi-solid-waste"
          label={t("giSolidWaste")}
          value={form.giSolidWaste}
          onChange={(v) => void save({ ...form, giSolidWaste: v })}
        />
        <TriState
          id="gi-detailed-screening"
          label={t("giDetailedScreening")}
          value={form.giDetailedScreening}
          onChange={(v) => void save({ ...form, giDetailedScreening: v })}
        />
      </div>
    </div>
  )
}
