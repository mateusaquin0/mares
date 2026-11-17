// Regras e limites dos schemas que os testes por arquivo ainda não exercitavam: bordas de
// tamanho (LIMITS), transformações e as chaves de mensagem que a interface traduz.

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { ZodType } from "zod"

import { LIMITS, FEEDBACK_MESSAGE_MAX, FEEDBACK_TITLE_MAX } from "@/schemas/limits"
import {
  MAX_SEQUENCES_PER_CONFIRMATION,
  sequenceRecordSchema,
  upsertAnalysisSchema,
  upsertConfirmationSchema,
} from "@/schemas/analysis.schema"
import { createAnimalSchema, shareAnimalSchema, updateAnimalSchema } from "@/schemas/animal.schema"
import {
  changePasswordSchema,
  forgotPasswordSchema,
  updateProfileSchema,
} from "@/schemas/auth.schema"
import {
  CATALOG_BY_REQUEST_TYPE,
  REQUEST_TYPE_BY_CATALOG,
  examTypeSchema,
  pathogenSchema,
} from "@/schemas/catalog.schema"
import {
  createCatalogRequestSchema,
  rejectCatalogRequestSchema,
} from "@/schemas/catalog-request.schema"
import { createFeedbackSchema, feedbackStatusSchema } from "@/schemas/feedback.schema"
import {
  updateGrossFindingSchema,
  updateHistopathologyFindingSchema,
  upsertSystemExamSchema,
} from "@/schemas/necropsy.schema"
import {
  addMemberSchema,
  newOrgRequestSchema,
  setActiveOrgSchema,
  updateOrganizationSchema,
} from "@/schemas/organization.schema"
import {
  addResearchMemberSchema,
  createResearchSchema,
  requestResearchAccessSchema,
  reviewAccessRequestSchema,
  updateResearchSchema,
} from "@/schemas/research.schema"
import { createSampleSchema, updateSampleSchema } from "@/schemas/sample.schema"

function messages(schema: ZodType, input: unknown): string[] {
  const r = schema.safeParse(input)
  return r.success ? [] : r.error.issues.map((i) => i.message)
}
const ok = (schema: ZodType, input: unknown) => schema.safeParse(input).success

describe("limites centralizados (LIMITS)", () => {
  it("reexporta os limites do feedback num ponto único", () => {
    expect(FEEDBACK_TITLE_MAX).toBe(100)
    expect(FEEDBACK_MESSAGE_MAX).toBe(500)
    expect(ok(createFeedbackSchema, { type: "BUG", title: "t".repeat(100), message: "m" })).toBe(
      true,
    )
  })

  it("o nome de pesquisa é mais curto que o nome padrão (aparece em selos e selects)", () => {
    expect(LIMITS.researchName).toBeLessThan(LIMITS.name)
  })
})

describe("pesquisa", () => {
  it("nome: 3 a 100 caracteres, com as chaves de cada violação", () => {
    expect(ok(createResearchSchema, { name: "a".repeat(LIMITS.researchName) })).toBe(true)
    expect(messages(createResearchSchema, { name: "a".repeat(LIMITS.researchName + 1) })).toEqual([
      "max100",
    ])
    expect(messages(createResearchSchema, { name: "ab" })).toEqual(["min3"])
  })

  it("descrição é opcional, aceita vazia e respeita o teto de texto longo", () => {
    expect(ok(createResearchSchema, { name: "Sotalia", description: "" })).toBe(true)
    expect(
      ok(createResearchSchema, { name: "Sotalia", description: "d".repeat(LIMITS.longText) }),
    ).toBe(true)
    expect(
      ok(createResearchSchema, { name: "Sotalia", description: "d".repeat(LIMITS.longText + 1) }),
    ).toBe(false)
  })

  it("edição é parcial, mas o nome enviado ainda é validado", () => {
    expect(ok(updateResearchSchema, {})).toBe(true)
    expect(ok(updateResearchSchema, { isPublic: true })).toBe(true)
    expect(messages(updateResearchSchema, { name: "ab" })).toEqual(["min3"])
    expect(ok(updateResearchSchema, { isPublic: "sim" })).toBe(false)
  })

  it("vínculo de membro exige o id do usuário", () => {
    expect(ok(addResearchMemberSchema, { userId: "u1" })).toBe(true)
    expect(ok(addResearchMemberSchema, { userId: "" })).toBe(false)
    expect(ok(addResearchMemberSchema, {})).toBe(false)
  })

  it("pedido de acesso: mensagem opcional, aparada e limitada", () => {
    expect(requestResearchAccessSchema.parse({})).toEqual({})
    expect(requestResearchAccessSchema.parse({ message: "  quero colaborar " })).toEqual({
      message: "quero colaborar",
    })
    expect(ok(requestResearchAccessSchema, { message: "" })).toBe(true)
    expect(ok(requestResearchAccessSchema, { message: "m".repeat(LIMITS.longText + 1) })).toBe(
      false,
    )
  })

  it("revisão do pedido só aceita aprovar ou recusar", () => {
    expect(ok(reviewAccessRequestSchema, { action: "approve" })).toBe(true)
    expect(ok(reviewAccessRequestSchema, { action: "reject" })).toBe(true)
    expect(ok(reviewAccessRequestSchema, { action: "delete" })).toBe(false)
  })
})

describe("amostra", () => {
  const base = { researchId: "r1", organId: "o1", identification: "A-01", sampleType: "Tecido" }

  it("apara identificação e tipo, e recusa os que ficam vazios depois de aparar", () => {
    const data = createSampleSchema.parse({
      ...base,
      identification: "  A-01 ",
      sampleType: " Swab ",
    })
    expect(data.identification).toBe("A-01")
    expect(data.sampleType).toBe("Swab")
    expect(messages(createSampleSchema, { ...base, identification: "   " })).toEqual(["required"])
  })

  it("exige a pesquisa dona e o material biológico", () => {
    expect(messages(createSampleSchema, { ...base, researchId: "" })).toEqual(["required"])
    expect(messages(createSampleSchema, { ...base, organId: "" })).toEqual(["required"])
  })

  it("data de coleta: só AAAA-MM-DD; vazia limpa", () => {
    expect(createSampleSchema.parse({ ...base, collectionDate: "2026-03-10" }).collectionDate).toBe(
      "2026-03-10",
    )
    expect(createSampleSchema.parse({ ...base, collectionDate: "" }).collectionDate).toBeNull()
    expect(messages(createSampleSchema, { ...base, collectionDate: "10/03/2026" })).toEqual([
      "invalidDate",
    ])
  })

  it("temperatura de armazenamento aceita negativo e null, mas não texto", () => {
    expect(createSampleSchema.parse({ ...base, storageTemp: -80 }).storageTemp).toBe(-80)
    expect(createSampleSchema.parse({ ...base, storageTemp: null }).storageTemp).toBeNull()
    expect(messages(createSampleSchema, { ...base, storageTemp: "-80" })).toEqual(["number"])
  })

  it("respeita os limites de identificação e de observações", () => {
    expect(ok(createSampleSchema, { ...base, identification: "i".repeat(LIMITS.name + 1) })).toBe(
      false,
    )
    expect(ok(createSampleSchema, { ...base, notes: "n".repeat(LIMITS.longText + 1) })).toBe(false)
  })

  it("edição é parcial e não reintroduz valores ausentes", () => {
    expect(updateSampleSchema.parse({})).toEqual({})
    expect(updateSampleSchema.parse({ status: "DEPLETED" })).toEqual({ status: "DEPLETED" })
    expect(ok(updateSampleSchema, { identification: "" })).toBe(false)
  })
})

describe("análise e confirmação de espécie", () => {
  const cell = { sampleId: "s1", pathogenId: "p1", examTypeId: "e1" }

  it("a medida quantitativa (Ct, título) é número ou null", () => {
    expect(upsertAnalysisSchema.parse({ ...cell, measureValue: 32.5 }).measureValue).toBe(32.5)
    expect(upsertAnalysisSchema.parse({ ...cell, measureValue: null }).measureValue).toBeNull()
    expect(messages(upsertAnalysisSchema, { ...cell, measureValue: "32,5" })).toEqual(["number"])
  })

  it("observação vazia limpa e a longa é recusada", () => {
    expect(upsertAnalysisSchema.parse({ ...cell, notes: "  " }).notes).toBeNull()
    expect(ok(upsertAnalysisSchema, { ...cell, notes: "n".repeat(LIMITS.longText + 1) })).toBe(
      false,
    )
  })

  it("registro de sequência: todos os campos opcionais, aparados e limitados", () => {
    expect(sequenceRecordSchema.parse({})).toEqual({})
    expect(
      sequenceRecordSchema.parse({ marker: " COI ", accession: "", pctIdentity: 99.2 }),
    ).toEqual({ marker: "COI", accession: null, pctIdentity: 99.2 })
    expect(ok(sequenceRecordSchema, { marker: "m".repeat(LIMITS.shortText + 1) })).toBe(false)
    expect(ok(sequenceRecordSchema, { consensus: "A".repeat(LIMITS.hugeText) })).toBe(true)
    expect(ok(sequenceRecordSchema, { consensus: "A".repeat(LIMITS.hugeText + 1) })).toBe(false)
    expect(ok(sequenceRecordSchema, { platform: "p".repeat(LIMITS.tinyText + 1) })).toBe(false)
  })

  it("confirmação exige espécie e exame; as sequências assumem lista vazia", () => {
    const data = upsertConfirmationSchema.parse({ pathogenId: "p1", examTypeId: "e1" })
    expect(data.sequences).toEqual([])
    expect(messages(upsertConfirmationSchema, { pathogenId: "", examTypeId: "e1" })).toEqual([
      "required",
    ])
    expect(messages(upsertConfirmationSchema, { pathogenId: "p1", examTypeId: "" })).toEqual([
      "required",
    ])
  })

  it("limita a quantidade de sequências por confirmação", () => {
    const seqs = (n: number) => Array.from({ length: n }, () => ({ marker: "COI" }))
    const body = { pathogenId: "p1", examTypeId: "e1" }
    expect(
      ok(upsertConfirmationSchema, { ...body, sequences: seqs(MAX_SEQUENCES_PER_CONFIRMATION) }),
    ).toBe(true)
    expect(
      ok(upsertConfirmationSchema, {
        ...body,
        sequences: seqs(MAX_SEQUENCES_PER_CONFIRMATION + 1),
      }),
    ).toBe(false)
  })

  it("resultado da confirmação segue o mesmo domínio do rastreio", () => {
    const body = { pathogenId: "p1", examTypeId: "e1" }
    expect(ok(upsertConfirmationSchema, { ...body, result: "NEGATIVO" })).toBe(true)
    expect(ok(upsertConfirmationSchema, { ...body, result: null })).toBe(true)
    expect(ok(upsertConfirmationSchema, { ...body, result: "TALVEZ" })).toBe(false)
  })
})

describe("animal", () => {
  const base = { researchId: "r1", controlId: "902/99", sex: "F", lifeStage: "ADULT" }

  it("apara o ID de controle e recusa o que fica vazio", () => {
    expect(createAnimalSchema.parse({ ...base, controlId: " 902/99 " }).controlId).toBe("902/99")
    expect(messages(createAnimalSchema, { ...base, controlId: "   " })).toEqual(["required"])
    expect(ok(createAnimalSchema, { ...base, controlId: "c".repeat(LIMITS.shortText + 1) })).toBe(
      false,
    )
  })

  it("sexo e estágio de vida ausentes respondem 'required'", () => {
    const semSexo = { ...base, sex: undefined }
    const semEstagio = { ...base, lifeStage: undefined }
    expect(messages(createAnimalSchema, semSexo)).toEqual(["required"])
    expect(messages(createAnimalSchema, semEstagio)).toEqual(["required"])
  })

  it.each([
    [-90, true],
    [90, true],
    [-90.0001, false],
    [90.0001, false],
  ])("latitude %s → aceita=%s", (lat, accepted) => {
    expect(ok(createAnimalSchema, { ...base, strandingLat: lat })).toBe(accepted)
  })

  it.each([
    [-180, true],
    [180, true],
    [-180.5, false],
    [180.5, false],
  ])("longitude %s → aceita=%s", (lon, accepted) => {
    expect(ok(createAnimalSchema, { ...base, strandingLon: lon })).toBe(accepted)
    if (!accepted) {
      expect(messages(createAnimalSchema, { ...base, strandingLon: lon })).toEqual(["lonRange"])
    }
  })

  it("AphiaID do WoRMS é inteiro", () => {
    expect(ok(createAnimalSchema, { ...base, wormsAphiaId: 137102 })).toBe(true)
    expect(ok(createAnimalSchema, { ...base, wormsAphiaId: 1.5 })).toBe(false)
    expect(ok(createAnimalSchema, { ...base, wormsAphiaId: null })).toBe(true)
  })

  it("peso zero é aceito; data de necrópsia segue a regra AAAA-MM-DD", () => {
    expect(ok(createAnimalSchema, { ...base, necropsyWeightKg: 0 })).toBe(true)
    expect(messages(createAnimalSchema, { ...base, necropsyWeightKg: "85" })).toEqual(["number"])
    expect(messages(createAnimalSchema, { ...base, necropsyDate: "10/03/2026" })).toEqual([
      "invalidDate",
    ])
  })

  it("notas macroscópicas têm o teto mais largo; campos curtos, o mais estreito", () => {
    expect(ok(createAnimalSchema, { ...base, macroscopicNotes: "n".repeat(LIMITS.hugeText) })).toBe(
      true,
    )
    expect(
      ok(createAnimalSchema, { ...base, macroscopicNotes: "n".repeat(LIMITS.hugeText + 1) }),
    ).toBe(false)
    expect(
      ok(createAnimalSchema, { ...base, bodyCondition: "b".repeat(LIMITS.tinyText + 1) }),
    ).toBe(false)
  })

  it("edição parcial não exige pesquisa nem identificador", () => {
    expect(updateAnimalSchema.parse({ species: " Sotalia guianensis " })).toEqual({
      species: "Sotalia guianensis",
    })
    expect(messages(updateAnimalSchema, { sex: "X" })).toEqual(["required"])
  })

  it("compartilhamento exige a pesquisa de destino; a mensagem é opcional", () => {
    expect(shareAnimalSchema.parse({ researchId: "r2", message: "  mesmo indivíduo " })).toEqual({
      researchId: "r2",
      message: "mesmo indivíduo",
    })
    expect(messages(shareAnimalSchema, { researchId: "" })).toEqual(["required"])
    expect(
      ok(shareAnimalSchema, { researchId: "r2", message: "m".repeat(LIMITS.longText + 1) }),
    ).toBe(false)
  })
})

describe("conta e organização", () => {
  it("recuperação de senha exige e-mail válido", () => {
    expect(ok(forgotPasswordSchema, { email: "ana@mares.org" })).toBe(true)
    expect(messages(forgotPasswordSchema, { email: "ana@" })).toEqual(["email"])
  })

  it("troca de senha: mínimo de 8 e confirmação igual", () => {
    expect(messages(changePasswordSchema, { password: "1234567", confirm: "1234567" })).toEqual([
      "passwordMin8",
    ])
    const r = changePasswordSchema.safeParse({ password: "12345678", confirm: "12345679" })
    expect(r.error?.issues[0]?.message).toBe("passwordsNoMatch")
    expect(r.error?.issues[0]?.path).toEqual(["confirm"])
  })

  it("nome do perfil: 2 a 255 caracteres", () => {
    expect(ok(updateProfileSchema, { name: "Jo" })).toBe(true)
    expect(messages(updateProfileSchema, { name: "J" })).toEqual(["name"])
    expect(ok(updateProfileSchema, { name: "n".repeat(LIMITS.name + 1) })).toBe(false)
  })

  it("dados do grupo: nome obrigatório (3+), localização opcional ou vazia", () => {
    expect(ok(updateOrganizationSchema, { name: "LabMar" })).toBe(true)
    expect(ok(updateOrganizationSchema, { name: "LabMar", city: "", state: "", country: "" })).toBe(
      true,
    )
    expect(messages(updateOrganizationSchema, { name: "LM" })).toEqual(["min3"])
    expect(
      ok(updateOrganizationSchema, { name: "LabMar", city: "c".repeat(LIMITS.name + 1) }),
    ).toBe(false)
  })

  it("novo grupo e troca de grupo ativo", () => {
    expect(messages(newOrgRequestSchema, { organizationName: "LM" })).toEqual(["min3"])
    expect(ok(newOrgRequestSchema, { organizationName: "LabMar" })).toBe(true)
    expect(ok(setActiveOrgSchema, { orgId: "org-1" })).toBe(true)
    expect(ok(setActiveOrgSchema, { orgId: "" })).toBe(false)
  })

  it("convite de membro: nome, quando enviado, tem pelo menos 2 caracteres", () => {
    expect(messages(addMemberSchema, { email: "a@b.co", name: "J" })).toEqual(["nameMin2"])
    expect(messages(addMemberSchema, { email: "sem-arroba" })).toEqual(["email"])
  })
})

describe("glossário", () => {
  it("o mapa tipo de solicitação ↔ catálogo é uma bijeção", () => {
    for (const [catalog, requestType] of Object.entries(REQUEST_TYPE_BY_CATALOG)) {
      expect(CATALOG_BY_REQUEST_TYPE[requestType]).toBe(catalog)
    }
    expect(Object.keys(CATALOG_BY_REQUEST_TYPE)).toHaveLength(
      Object.keys(REQUEST_TYPE_BY_CATALOG).length,
    )
  })

  it("exame: apara os nomes e limita a unidade da medida", () => {
    expect(examTypeSchema.parse({ namePt: " PCR ", nameEn: " PCR " })).toEqual({
      namePt: "PCR",
      nameEn: "PCR",
    })
    const base = { namePt: "PCR", nameEn: "PCR" }
    expect(ok(examTypeSchema, { ...base, measureUnit: "u".repeat(LIMITS.measureUnit) })).toBe(true)
    expect(ok(examTypeSchema, { ...base, measureUnit: "u".repeat(LIMITS.measureUnit + 1) })).toBe(
      false,
    )
  })

  it("patógeno: TaxId do NCBI é inteiro ou null", () => {
    expect(ok(pathogenSchema, { groupId: "g1", taxonId: 11234 })).toBe(true)
    expect(ok(pathogenSchema, { groupId: "g1", taxonId: null })).toBe(true)
    expect(ok(pathogenSchema, { groupId: "g1", taxonId: 1.2 })).toBe(false)
    expect(ok(pathogenSchema, { groupId: "g1", taxonId: "11234" })).toBe(false)
    expect(ok(pathogenSchema, { groupId: "g1", taxonRank: "r".repeat(LIMITS.tinyText + 1) })).toBe(
      false,
    )
  })

  it("solicitação: payload precisa ser objeto e o alvo de edição, quando vem, não é vazio", () => {
    expect(ok(createCatalogRequestSchema, { type: "organs", payload: "Fígado" })).toBe(false)
    expect(ok(createCatalogRequestSchema, { type: "systems", payload: {}, targetId: "s1" })).toBe(
      true,
    )
    expect(ok(createCatalogRequestSchema, { type: "systems", payload: {}, targetId: "" })).toBe(
      false,
    )
  })

  it("rejeição: a nota é opcional e limitada", () => {
    expect(ok(rejectCatalogRequestSchema, {})).toBe(true)
    expect(ok(rejectCatalogRequestSchema, { note: "" })).toBe(true)
    expect(ok(rejectCatalogRequestSchema, { note: "n".repeat(LIMITS.longText + 1) })).toBe(false)
  })
})

describe("feedback", () => {
  it("REOPENED existe como status, embora a triagem não possa gravá-lo", () => {
    expect(feedbackStatusSchema.options).toContain("REOPENED")
  })

  it("apara título e mensagem antes de gravar", () => {
    const data = createFeedbackSchema.parse({ type: "BUG", title: "  Erro ", message: " some " })
    expect(data.title).toBe("Erro")
    expect(data.message).toBe("some")
  })
})

describe("laudo — edição parcial e limites", () => {
  it("o motivo de 'não examinado' é aparado e limitado", () => {
    const data = upsertSystemExamSchema.parse({
      systemId: "s1",
      status: "NOT_EXAMINED",
      notExaminedReason: "  carcaça em decomposição avançada ",
    })
    expect(data.notExaminedReason).toBe("carcaça em decomposição avançada")
    expect(
      ok(upsertSystemExamSchema, {
        systemId: "s1",
        status: "NOT_EXAMINED",
        notExaminedReason: "m".repeat(LIMITS.shortText + 1),
      }),
    ).toBe(false)
  })

  it("status ausente vira null (sistema acrescentado sem pronunciamento)", () => {
    expect(upsertSystemExamSchema.parse({ systemId: "s1" }).status).toBeNull()
    expect(messages(upsertSystemExamSchema, { systemId: "" })).toEqual(["required"])
  })

  it("a edição do achado não aceita trocar de sistema (o campo é descartado)", () => {
    const data = updateGrossFindingSchema.parse({ systemId: "outro", lesion: "úlcera" })
    expect(data).toEqual({ lesion: "úlcera" })
  })

  it("edição do achado: tecido e local têm o teto de descritor curto", () => {
    expect(ok(updateGrossFindingSchema, { tissue: "t".repeat(LIMITS.microText) })).toBe(true)
    expect(ok(updateGrossFindingSchema, { tissue: "t".repeat(LIMITS.microText + 1) })).toBe(false)
    expect(ok(updateGrossFindingSchema, { site: "s".repeat(LIMITS.microText + 1) })).toBe(false)
  })

  it("edição do achado: quantidade de parasitas é inteiro não negativo", () => {
    const body = { parasitesCollected: true }
    expect(messages(updateGrossFindingSchema, { ...body, parasiteCount: 1.5 })).toEqual(["integer"])
    expect(messages(updateGrossFindingSchema, { ...body, parasiteCount: -1 })).toEqual(["min"])
    expect(
      updateGrossFindingSchema.parse({ ...body, parasiteCount: null }).parasiteCount,
    ).toBeNull()
  })

  it("edição parcial do achado micro valida só o que foi enviado", () => {
    expect(updateHistopathologyFindingSchema.parse({})).toEqual({})
    expect(messages(updateHistopathologyFindingSchema, { finding: "" })).toEqual(["required"])
    expect(
      ok(updateHistopathologyFindingSchema, { finding: "f".repeat(LIMITS.longText + 1) }),
    ).toBe(false)
  })
})

// As mensagens dos schemas são CHAVES do namespace `validation`. Uma chave sem tradução
// aparece crua na tela ("validation.min3") — e só no formulário que ninguém abriu.
describe("i18n das chaves de validação", () => {
  const USED_KEYS = [
    "email",
    "name",
    "nameMin2",
    "min3",
    "max100",
    "passwordMin6",
    "passwordMin8",
    "passwordsNoMatch",
    "termsRequired",
    "required",
    "number",
    "latRange",
    "lonRange",
    "invalidDate",
    "notExaminedReasonRequired",
    "notExaminedReasonNotAllowed",
    "integer",
    "min",
    "max",
    "parasiteCountRequiresCollected",
    "duplicateInteraction",
    "interactionsRequireAnthropic",
  ]

  it.each(["pt", "en"])("%s.validation traduz todas as chaves usadas pelos schemas", (locale) => {
    const all = JSON.parse(
      readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf-8"),
    ) as Record<string, Record<string, string>>
    const ns = all.validation ?? {}
    expect(USED_KEYS.filter((k) => !ns[k])).toEqual([])
  })
})
