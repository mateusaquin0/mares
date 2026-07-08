"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  createAnimalSchema,
  updateAnimalSchema,
  type CreateAnimalData,
} from "@/schemas/animal.schema"
import { useAnimal, useCreateAnimal, useUpdateAnimal, useSimbaLookup } from "@/hooks/use-animals"
import type { AnimalDetail } from "@/types/animal"
import { useErrorMessage } from "@/lib/use-error-message"

// Estado do formulário — tudo string (inputs controlados); convertido no submit.
export type FormState = {
  researchId: string
  species: string
  wormsAphiaId: string
  taxonFamily: string
  taxonOrder: string
  controlId: string
  simbaRecordNumber: string
  sex: string
  lifeStage: string
  bodyCondition: string
  decompositionStage: string
  deathCondition: string
  necropsyDate: string
  strandingLat: string
  strandingLon: string
  strandingBeach: string
  municipality: string
  state: string
  eventDate: string
  macroscopicNotes: string
  isPublic: boolean
}

export const emptyForm: FormState = {
  researchId: "",
  species: "",
  wormsAphiaId: "",
  taxonFamily: "",
  taxonOrder: "",
  controlId: "",
  simbaRecordNumber: "",
  sex: "",
  lifeStage: "",
  bodyCondition: "",
  decompositionStage: "",
  deathCondition: "",
  necropsyDate: "",
  strandingLat: "",
  strandingLon: "",
  strandingBeach: "",
  municipality: "",
  state: "",
  eventDate: "",
  macroscopicNotes: "",
  isPublic: true, // visível por padrão; o admin pode ocultar (opt-out)
}

// Campos de encalhe que podem ser marcados como "sem informação" (desabilitados
// individualmente). Obrigatórios por padrão no cliente; ao desabilitar, vão como null.
export const STRANDING_TOGGLEABLE = [
  "eventDate",
  "municipality",
  "state",
  "strandingLat",
  "strandingLon",
] as const
export type ToggleableField = (typeof STRANDING_TOGGLEABLE)[number]

// ISO -> YYYY-MM-DD para <input type="date">.
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "")

// Mapeia o detalhe carregado (edição) para o estado do formulário.
function mapAnimalToForm(full: AnimalDetail): FormState {
  return {
    researchId: full.research.id,
    species: full.species ?? "",
    wormsAphiaId: full.wormsAphiaId?.toString() ?? "",
    taxonFamily: full.taxonFamily ?? "",
    taxonOrder: full.taxonOrder ?? "",
    controlId: full.controlId ?? "",
    simbaRecordNumber: full.simbaRecordNumber ?? "",
    sex: full.sex ?? "",
    lifeStage: full.lifeStage ?? "",
    bodyCondition: full.bodyCondition ?? "",
    decompositionStage: full.decompositionStage ?? "",
    deathCondition: full.deathCondition ?? "",
    necropsyDate: toDateInput(full.necropsyDate),
    strandingLat: full.strandingLat?.toString() ?? "",
    strandingLon: full.strandingLon?.toString() ?? "",
    strandingBeach: full.strandingBeach ?? "",
    municipality: full.municipality ?? "",
    state: full.state ?? "",
    eventDate: toDateInput(full.eventDate),
    macroscopicNotes: full.macroscopicNotes ?? "",
    isPublic: full.isPublic ?? false,
  }
}

// Erros de validação por campo: chave do campo -> chave de mensagem (namespace `validation`).
export type FieldErrors = Record<string, string>

// API que o formulário expõe para as seções e o diálogo.
export type AnimalFormApi = {
  form: FormState
  errors: FieldErrors
  set: (patch: Partial<FormState>) => void
  // Campos de encalhe marcados como "sem informação" (desabilitados).
  disabled: Partial<Record<ToggleableField, boolean>>
  toggleDisabled: (field: ToggleableField) => void
  saving: boolean
  isDirty: boolean
  fetchingSimba: boolean
  fetchSimba: () => Promise<void>
  submit: (e: FormEvent) => Promise<void>
}

export function useAnimalForm({
  open,
  mode,
  animalId,
  defaultResearchId,
  isOrgAdmin,
  onSaved,
}: {
  open: boolean
  mode: "create" | "edit"
  animalId?: string
  defaultResearchId: string
  isOrgAdmin: boolean
  onSaved: () => void
}): AnimalFormApi {
  const t = useTranslations("animals")
  const em = useErrorMessage()

  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [disabled, setDisabled] = useState<Partial<Record<ToggleableField, boolean>>>({})
  const initialForm = useRef<FormState>(emptyForm)
  const initialDisabled = useRef<Partial<Record<ToggleableField, boolean>>>({})

  const createM = useCreateAnimal()
  const updateM = useUpdateAnimal(animalId ?? "")
  const simbaM = useSimbaLookup()
  const saving = createM.isPending || updateM.isPending
  const fetchingSimba = simbaM.isPending

  // Prefill (edição): carrega o animal via react-query (cache/dedupe), só quando aberto.
  const editing = mode === "edit" && !!animalId
  const animalQ = useAnimal(animalId ?? "", open && editing)

  // Criar: formulário em branco ao abrir.
  useEffect(() => {
    if (!open) return
    setErrors({})
    if (mode === "create") {
      const init = { ...emptyForm, researchId: defaultResearchId }
      setForm(init)
      initialForm.current = init
      setDisabled({})
      initialDisabled.current = {}
    }
  }, [open, mode, defaultResearchId])

  // Editar: semeia o formulário quando o detalhe chega. Campos de encalhe vazios entram
  // como "sem informação" (desabilitados), refletindo registros sem esse dado.
  useEffect(() => {
    if (open && editing && animalQ.data) {
      const init = mapAnimalToForm(animalQ.data)
      setForm(init)
      initialForm.current = init
      const initDisabled: Partial<Record<ToggleableField, boolean>> = {}
      for (const f of STRANDING_TOGGLEABLE) if (!init[f].trim()) initDisabled[f] = true
      setDisabled(initDisabled)
      initialDisabled.current = initDisabled
    }
  }, [open, editing, animalQ.data])

  const set = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }))
    // Limpa o erro dos campos que estão sendo editados.
    setErrors((e) => {
      if (Object.keys(e).length === 0) return e
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k]
      return next
    })
  }

  // Alterna "sem informação" de um campo de encalhe: ao desabilitar, limpa o valor e o erro.
  const toggleDisabled = (field: ToggleableField) => {
    const willDisable = !disabled[field]
    setDisabled((d) => ({ ...d, [field]: willDisable }))
    if (willDisable) set({ [field]: "" } as Partial<FormState>)
  }

  // Busca o registro no SIMBA e pré-preenche o formulário (o usuário revisa e salva).
  async function fetchSimba() {
    const rec = form.simbaRecordNumber.trim()
    if (!rec) return
    try {
      const d = await simbaM.mutateAsync(rec)
      set({
        simbaRecordNumber: d.simbaRecordNumber ?? rec,
        species: d.species ?? form.species,
        wormsAphiaId: d.wormsAphiaId?.toString() ?? "",
        taxonFamily: d.taxonFamily ?? "",
        taxonOrder: d.taxonOrder ?? "",
        sex: d.sex ?? "",
        lifeStage: d.lifeStage ?? "",
        strandingLat: d.strandingLat?.toString() ?? "",
        strandingLon: d.strandingLon?.toString() ?? "",
        strandingBeach: d.strandingBeach ?? "",
        municipality: d.municipality ?? "",
        state: d.state ?? "",
        eventDate: d.eventDate ? d.eventDate.slice(0, 10) : "",
        necropsyDate: d.necropsyDate ? d.necropsyDate.slice(0, 10) : "",
        // "Exame externo": só o SIMBA traz (occurrenceRemarks); preserva o texto
        // atual se o registro não tiver observações.
        macroscopicNotes: d.macroscopicNotes ?? form.macroscopicNotes,
      })
      // Reabilita os campos de encalhe que o SIMBA trouxe preenchidos.
      const filled: Record<ToggleableField, string> = {
        eventDate: d.eventDate ? d.eventDate.slice(0, 10) : "",
        municipality: d.municipality ?? "",
        state: d.state ?? "",
        strandingLat: d.strandingLat?.toString() ?? "",
        strandingLon: d.strandingLon?.toString() ?? "",
      }
      setDisabled((old) => {
        const next = { ...old }
        for (const f of STRANDING_TOGGLEABLE) if (filled[f].trim() !== "") next[f] = false
        return next
      })
      toast.success(t("simbaFetched"))
    } catch (err) {
      toast.error(t("simbaFetchError"), { description: em(err) })
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const isEdit = mode === "edit"

    // Monta o payload enviando a string (vazia quando em branco): o schema decide
    // — campo obrigatório vazio vira erro "required"; opcional vazio vira null.
    const str = (v: string) => v.trim()
    const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v))
    const payload: Record<string, unknown> = {
      species: str(form.species),
      wormsAphiaId: form.wormsAphiaId.trim() === "" ? null : Number(form.wormsAphiaId),
      taxonFamily: str(form.taxonFamily),
      taxonOrder: str(form.taxonOrder),
      controlId: str(form.controlId),
      simbaRecordNumber: str(form.simbaRecordNumber),
      sex: str(form.sex),
      lifeStage: str(form.lifeStage),
      bodyCondition: str(form.bodyCondition),
      decompositionStage: str(form.decompositionStage),
      deathCondition: str(form.deathCondition),
      necropsyDate: str(form.necropsyDate),
      strandingLat: numOrNull(form.strandingLat),
      strandingLon: numOrNull(form.strandingLon),
      strandingBeach: str(form.strandingBeach),
      municipality: str(form.municipality),
      state: str(form.state),
      eventDate: str(form.eventDate),
      macroscopicNotes: str(form.macroscopicNotes),
    }
    if (isOrgAdmin) payload.isPublic = form.isPublic
    if (!isEdit) payload.researchId = form.researchId

    // Obrigatoriedade dos campos de encalhe é client-side: exigidos por padrão, mas
    // dispensados quando marcados como "sem informação" (o schema os aceita nulos).
    const fieldErrors: FieldErrors = {}
    for (const f of STRANDING_TOGGLEABLE) {
      if (!disabled[f] && form[f].trim() === "") fieldErrors[f] = "required"
    }

    // Validação interna com o mesmo schema do servidor, antes do POST.
    const parsed = (isEdit ? updateAnimalSchema : createAnimalSchema).safeParse(payload)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "")
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
      }
    }
    if (Object.keys(fieldErrors).length > 0 || !parsed.success) {
      setErrors(fieldErrors)
      return
    }

    try {
      if (isEdit) await updateM.mutateAsync(parsed.data)
      else await createM.mutateAsync(parsed.data as CreateAnimalData)
      toast.success(isEdit ? t("updated") : t("created"))
      onSaved()
    } catch (err) {
      toast.error(isEdit ? t("updateError") : t("createError"), {
        description: em(err),
      })
    }
  }

  const isDirty =
    JSON.stringify(form) !== JSON.stringify(initialForm.current) ||
    JSON.stringify(disabled) !== JSON.stringify(initialDisabled.current)

  return {
    form,
    errors,
    set,
    disabled,
    toggleDisabled,
    saving,
    isDirty,
    fetchingSimba,
    fetchSimba,
    submit,
  }
}
