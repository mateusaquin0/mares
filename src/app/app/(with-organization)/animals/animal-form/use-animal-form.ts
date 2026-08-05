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
import { animalsService } from "@/services/animals"
import type { AnimalDetail } from "@/types/animal"
import { apiErrorBody } from "@/lib/http"
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

// Ordem visual dos campos e o id do elemento no DOM (difere da chave de erro em alguns
// casos, ex.: strandingLat -> "lat"). Usado para rolar/focar o primeiro campo inválido.
const FIELD_DOM_ORDER: { key: string; domId: string }[] = [
  { key: "researchId", domId: "research" },
  { key: "species", domId: "species" },
  { key: "controlId", domId: "controlId" },
  { key: "simbaRecordNumber", domId: "simba" },
  { key: "eventDate", domId: "eventDate" },
  { key: "strandingBeach", domId: "beach" },
  { key: "municipality", domId: "municipality" },
  { key: "state", domId: "state" },
  { key: "strandingLat", domId: "lat" },
  { key: "strandingLon", domId: "lon" },
  { key: "sex", domId: "sex" },
  { key: "lifeStage", domId: "lifeStage" },
  { key: "bodyCondition", domId: "bodyCondition" },
  { key: "decompositionStage", domId: "decomp" },
  { key: "deathCondition", domId: "deathCondition" },
  { key: "necropsyDate", domId: "necropsyDate" },
  { key: "macroscopicNotes", domId: "notes" },
]

// Rola até o primeiro campo inválido (na ordem visual) e o foca, após o render aplicar o erro.
function focusFirstError(fieldErrors: FieldErrors) {
  const first = FIELD_DOM_ORDER.find((f) => fieldErrors[f.key])
  if (!first) return
  requestAnimationFrame(() => {
    const el = document.getElementById(first.domId)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    ;(el as HTMLElement).focus?.({ preventScroll: true })
  })
}

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

// Indivíduo já cadastrado numa pesquisa fora do escopo: identifica o registro em conflito e
// a pesquisa que o detém, para oferecer o pedido de compartilhamento. A identidade mínima
// (espécie/data/local) permite comparar com o que a pessoa digitou — se divergir, o caso é
// de identificador errado, não de indivíduo repetido.
export type ShareConflict = {
  animalId: string
  research: string
  species: string
  eventDate: string
  location: string
}

// Identificador pertence a um indivíduo que o usuário ENXERGA: em vez de pedir nada, a
// saída é abrir o registro existente (em nova aba, preservando o formulário).
export type VisibleConflict = { animalId: string; research: string }

// API que o formulário expõe para as seções e o diálogo.
export type AnimalFormApi = {
  form: FormState
  errors: FieldErrors
  set: (patch: Partial<FormState>) => void
  // Campos de encalhe marcados como "sem informação" (desabilitados).
  disabled: Partial<Record<ToggleableField, boolean>>
  toggleDisabled: (field: ToggleableField) => void
  // Espécie marcada como indeterminada (null no servidor).
  speciesIndet: boolean
  toggleSpeciesIndet: () => void
  saving: boolean
  isDirty: boolean
  fetchingSimba: boolean
  fetchSimba: () => Promise<void>
  submit: (e: FormEvent) => Promise<void>
  // Conflito com indivíduo de outra pesquisa: alimenta o diálogo que oferece pedi-lo.
  shareConflict: ShareConflict | null
  dismissShareConflict: () => void
  requestShare: () => Promise<void>
  // Identificador de um indivíduo VISÍVEL: diálogo com atalho para abrir o registro.
  visibleConflict: VisibleConflict | null
  dismissVisibleConflict: () => void
  // Consulta prévia do identificador (evita preencher o formulário para levar 409 no fim).
  checkingId: boolean
  checkIdentifier: (field: "controlId" | "simbaRecordNumber") => Promise<void>
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
  // Espécie indeterminada (carcaça não identificável): mesmo padrão dos campos de encalhe,
  // porém com estado próprio, pois limpar espécie também limpa o vínculo WoRMS/família/ordem.
  const [speciesIndet, setSpeciesIndet] = useState(false)
  const [shareConflict, setShareConflict] = useState<ShareConflict | null>(null)
  const [visibleConflict, setVisibleConflict] = useState<VisibleConflict | null>(null)
  const [checkingId, setCheckingId] = useState(false)
  const initialForm = useRef<FormState>(emptyForm)
  const initialDisabled = useRef<Partial<Record<ToggleableField, boolean>>>({})
  const initialSpeciesIndet = useRef(false)

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
    setShareConflict(null)
    setVisibleConflict(null)
    if (mode === "create") {
      const init = { ...emptyForm, researchId: defaultResearchId }
      setForm(init)
      initialForm.current = init
      setDisabled({})
      initialDisabled.current = {}
      setSpeciesIndet(false)
      initialSpeciesIndet.current = false
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
      // Espécie ausente = indeterminada.
      const indet = init.species.trim() === ""
      setSpeciesIndet(indet)
      initialSpeciesIndet.current = indet
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

  // Alterna "espécie indeterminada": ao marcar, limpa a espécie e o vínculo taxonômico.
  const toggleSpeciesIndet = () => {
    const willIndet = !speciesIndet
    setSpeciesIndet(willIndet)
    if (willIndet) set({ species: "", wormsAphiaId: "", taxonFamily: "", taxonOrder: "" })
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
      // Conferência silenciosa: se o registro SIMBA já foi cadastrado por alguém do grupo,
      // melhor descobrir AGORA do que depois de revisar o formulário inteiro. Silenciosa
      // porque "está livre" aqui seria ruído — só fala quando há conflito.
      await checkIdentifier("simbaRecordNumber", { silent: true })
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
    // Espécie: obrigatória, salvo quando marcada como indeterminada (schema aceita null).
    if (!speciesIndet && form.species.trim() === "") fieldErrors.species = "required"

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
      toast.error(t("formInvalid"))
      focusFirstError(fieldErrors)
      return
    }

    try {
      if (isEdit) await updateM.mutateAsync(parsed.data)
      else await createM.mutateAsync(parsed.data as CreateAnimalData)
      toast.success(isEdit ? t("updated") : t("created"))
      onSaved()
    } catch (err) {
      // Conflitos de identificador têm diálogo próprio (as ações NÃO podem viver num toast:
      // este formulário é um Dialog do Radix, que marca `pointer-events: none` fora do modal
      // e deixa botões de toast inclicáveis). Quando um diálogo abre, ele substitui o toast
      // de erro — as duas coisas juntas seriam ruído.
      const conflict = outOfScopeConflict(err)
      if (conflict && !isEdit && form.researchId) {
        setShareConflict(conflict)
        return
      }
      const visible = visibleDuplicate(err)
      if (visible) {
        setVisibleConflict(visible)
        return
      }
      toast.error(isEdit ? t("updateError") : t("createError"), { description: em(err) })
    }
  }

  // Erro de identificador duplicado cujo dono está fora do escopo do usuário — carrega o id
  // do indivíduo em conflito e o nome da pesquisa que o detém (ver animalDuplicateConflict
  // em src/lib/animals.ts).
  function outOfScopeConflict(err: unknown): ShareConflict | null {
    const body = apiErrorBody(err) as
      { code?: string; params?: Partial<ShareConflict> } | null | undefined
    const isOutOfScope =
      body?.code === "animalControlDuplicateOutOfScope" ||
      body?.code === "animalSimbaDuplicateOutOfScope"
    const p = body?.params
    if (!isOutOfScope || !p?.animalId) return null
    return {
      animalId: p.animalId,
      research: p.research ?? "",
      species: p.species ?? "",
      eventDate: p.eventDate ?? "",
      location: p.location ?? "",
    }
  }

  // Duplicado numa pesquisa que o usuário ENXERGA — a saída é abrir o registro existente.
  function visibleDuplicate(err: unknown): VisibleConflict | null {
    const body = apiErrorBody(err) as
      { code?: string; params?: { animalId?: string; research?: string } } | null | undefined
    const match =
      body?.code === "animalControlDuplicateInResearch" ||
      body?.code === "animalSimbaDuplicateInResearch"
    if (!match || !body?.params?.animalId) return null
    return { animalId: body.params.animalId, research: body.params.research ?? "" }
  }

  /**
   * Confere, ANTES de preencher o resto do formulário, se o identificador já pertence a um
   * indivíduo do grupo. Todo desfecho tem uma saída acionável:
   *   • livre                     → segue o cadastro;
   *   • é o PRÓPRIO registro      → (edição) confirma que está tudo certo;
   *   • existe e é visível        → diálogo com atalho para abrir o registro em nova aba;
   *   • existe fora do escopo     → diálogo do conflito, oferecendo pedir o indivíduo
   *     (só no cadastro — no meio de uma edição o caso é identificador digitado errado).
   *
   * `silent` suprime o "está livre" (usado na conferência automática pós-importação SIMBA,
   * onde só vale a pena falar quando há problema).
   */
  async function checkIdentifier(
    field: "controlId" | "simbaRecordNumber",
    opts: { silent?: boolean } = {},
  ) {
    const value = form[field].trim()
    if (!value) return
    try {
      setCheckingId(true)
      const found = await animalsService.lookupIdentifier({ [field]: value })
      if (!found.found) {
        if (!opts.silent) toast.success(t("idAvailable"))
        return
      }
      // Edição: o identificador apontar para o registro em edição não é conflito.
      if (mode === "edit" && found.animalId === animalId) {
        if (!opts.silent) toast.success(t("idOwnRecord"))
        return
      }
      if (found.visible) {
        setVisibleConflict({ animalId: found.animalId, research: found.research })
        return
      }
      if (mode === "edit") {
        toast.warning(t("idTaken"), { description: t("idTakenIn", { research: found.research }) })
        return
      }
      setShareConflict({
        animalId: found.animalId,
        research: found.research,
        species: found.species,
        eventDate: found.eventDate,
        location: found.location,
      })
    } catch (err) {
      toast.error(t("idCheckError"), { description: em(err) })
    } finally {
      setCheckingId(false)
    }
  }

  // Pede que o indivíduo em conflito seja compartilhado com a pesquisa escolhida no
  // formulário. Quem decide é a pesquisa de origem (ver POST /api/animals/[id]/researches).
  async function requestShare() {
    if (!shareConflict) return
    try {
      await animalsService.shareWithResearch(shareConflict.animalId, form.researchId)
      toast.success(t("shareRequestSent"), { description: t("shareRequestSentDesc") })
      setShareConflict(null)
    } catch (err) {
      // Pedido repetido não é falha: alguém (talvez a própria pessoa, noutro momento) já o
      // abriu e ele segue aguardando a pesquisa de origem. Informa e encerra o diálogo.
      const body = apiErrorBody(err) as { code?: string } | null
      if (body?.code === "animalSharePending") {
        toast.info(t("sharePendingAlready"), { description: t("shareRequestSentDesc") })
        setShareConflict(null)
        return
      }
      toast.error(t("shareError"), { description: em(err) })
    }
  }

  const isDirty =
    JSON.stringify(form) !== JSON.stringify(initialForm.current) ||
    JSON.stringify(disabled) !== JSON.stringify(initialDisabled.current) ||
    speciesIndet !== initialSpeciesIndet.current

  return {
    form,
    errors,
    set,
    disabled,
    toggleDisabled,
    speciesIndet,
    toggleSpeciesIndet,
    saving,
    isDirty,
    fetchingSimba,
    fetchSimba,
    submit,
    shareConflict,
    dismissShareConflict: () => setShareConflict(null),
    requestShare,
    visibleConflict,
    dismissVisibleConflict: () => setVisibleConflict(null),
    checkingId,
    checkIdentifier,
  }
}
