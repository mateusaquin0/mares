// Amostras, confirmação de espécie por sequenciamento, laudo e auditoria: a lógica em volta
// das consultas (erros de domínio, o que é gravado, mapeamento de unicidade em conflito).

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", async () => (await import("./helpers/prisma-mock")).prismaModule)

import { arg, m, prismaError, resetDb, root } from "./helpers/prisma-mock"
import { writeAudit } from "@/lib/audit"
import { knownGroups, knownLabels } from "@/lib/biometry-db"
import {
  createConfirmation,
  deleteConfirmation,
  loadConfirmation,
  loadPositiveParent,
  updateConfirmation,
} from "@/lib/confirmations"
import { loadMediaOrg } from "@/lib/media"
import {
  assertOrganExists,
  assertSystemExists,
  findingsPresentError,
  interactionsAuditValue,
  loadGrossFinding,
  loadHistopathologyFinding,
  loadSystemExam,
  nextGrossPosition,
  nextHistopathologyPosition,
  nextSystemPosition,
  toScreening,
} from "@/lib/necropsy"
import { assertOrgan, sampleData, sampleDuplicateError } from "@/lib/samples"
import { upsertConfirmationSchema } from "@/schemas/analysis.schema"

beforeEach(() => resetDb())

describe("sampleData — campos validados → dados do Prisma", () => {
  it("apara identificação e tipo e converte a data para meia-noite UTC", () => {
    const data = sampleData({
      identification: " A-01 ",
      sampleType: " Tecido ",
      collectionDate: "2026-03-10",
    })
    expect(data.identification).toBe("A-01")
    expect(data.sampleType).toBe("Tecido")
    expect(data.collectionDate?.toISOString()).toBe("2026-03-10T00:00:00.000Z")
  })

  // undefined = não alterar; null = limpar. Confundir os dois apagaria a data num PUT parcial.
  it("preserva a diferença entre 'não enviado' e 'limpar'", () => {
    const ausente = sampleData({})
    expect(ausente.collectionDate).toBeUndefined()
    expect(ausente.identification).toBeUndefined()
    expect(ausente.notes).toBeUndefined()

    const limpo = sampleData({ collectionDate: null, notes: null, storageTemp: null })
    expect(limpo.collectionDate).toBeNull()
    expect(limpo.notes).toBeNull()
    expect(limpo.storageTemp).toBeNull()
  })

  it("repassa armazenamento, temperatura e status como vieram", () => {
    const data = sampleData({ storageLocation: "Freezer 2", storageTemp: -80, status: "IN_USE" })
    expect(data).toMatchObject({ storageLocation: "Freezer 2", storageTemp: -80, status: "IN_USE" })
  })
})

describe("amostra — erros de domínio", () => {
  it("identificação repetida é conflito com código próprio", () => {
    const err = sampleDuplicateError()
    expect(err.name).toBe("ConflictError")
    expect(err.code).toBe("sampleIdentificationDuplicate")
  })

  it("material biológico inexistente vira 404; existente passa", async () => {
    m("organ", "findUnique").mockResolvedValue(null)
    await expect(assertOrgan("o-x")).rejects.toMatchObject({
      name: "NotFoundError",
      code: "organNotFound",
    })
    m("organ", "findUnique").mockResolvedValue({ id: "o1" })
    await expect(assertOrgan("o1")).resolves.toBeUndefined()
  })
})

describe("mídia — escopo pela pesquisa dona do arquivo", () => {
  it("arquivo inexistente vira 404", async () => {
    m("animalMedia", "findUnique").mockResolvedValue(null)
    await expect(loadMediaOrg("m-x")).rejects.toMatchObject({ code: "mediaNotFound" })
  })
})

describe("confirmação de espécie — quem pode receber", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "an-1",
    sampleId: "s-1",
    parentAnalysisId: null,
    result: "POSITIVO",
    sample: { researchId: "r1", orgId: "org-a" },
    ...over,
  })

  it("rastreio inexistente vira 404", async () => {
    m("analysis", "findUnique").mockResolvedValue(null)
    await expect(loadPositiveParent("an-x")).rejects.toMatchObject({ code: "analysisNotFound" })
  })

  // Confirmação de confirmação não existe: o pai precisa ser um RASTREIO.
  it("uma confirmação não pode ser pai de outra", async () => {
    m("analysis", "findUnique").mockResolvedValue(row({ parentAnalysisId: "an-0" }))
    await expect(loadPositiveParent("an-1")).rejects.toMatchObject({
      name: "NotFoundError",
      code: "analysisNotFound",
    })
  })

  it.each(["NEGATIVO", "INCONCLUSIVO", null])(
    "rastreio com resultado %s não recebe confirmação",
    async (result) => {
      m("analysis", "findUnique").mockResolvedValue(row({ result }))
      await expect(loadPositiveParent("an-1")).rejects.toMatchObject({
        name: "ValidationError",
        code: "confirmationParentNotPositive",
      })
    },
  )

  it("carregar como confirmação um rastreio (ou id inexistente) vira 404", async () => {
    m("analysis", "findUnique").mockResolvedValue(row())
    await expect(loadConfirmation("an-1")).rejects.toMatchObject({ code: "analysisNotFound" })
    m("analysis", "findUnique").mockResolvedValue(null)
    await expect(loadConfirmation("an-x")).rejects.toMatchObject({ code: "analysisNotFound" })
  })
})

describe("confirmação de espécie — gravação", () => {
  const parent = { id: "an-1", sampleId: "s-1", orgId: "org-a", researchId: "r1" }
  // O corpo passa pelo schema da rota: é ele que entrega `sequences: []` e os opcionais.
  const confirmation = (over: Record<string, unknown> = {}) =>
    upsertConfirmationSchema.parse({ pathogenId: "p-especie", examTypeId: "e-seq", ...over })
  const body = confirmation()

  it("nasce filha do rastreio, na mesma amostra, POSITIVA por padrão", async () => {
    m("analysis", "create").mockResolvedValue({ id: "an-2" })
    m("analysis", "findUniqueOrThrow").mockResolvedValue({ id: "an-2" })
    await expect(createConfirmation(parent, body)).resolves.toEqual({ id: "an-2" })

    expect(root("$transaction")).toHaveBeenCalledTimes(1)
    expect(arg(m("analysis", "create")).data).toEqual({
      sampleId: "s-1",
      parentAnalysisId: "an-1",
      pathogenId: "p-especie",
      examTypeId: "e-seq",
      result: "POSITIVO",
      notes: null,
    })
    // Sem sequências, nada é inserido na tabela delas.
    expect(m("sequenceRecord", "createMany")).not.toHaveBeenCalled()
  })

  it("respeita o resultado informado e grava as sequências com os campos ausentes como null", async () => {
    m("analysis", "create").mockResolvedValue({ id: "an-2" })
    await createConfirmation(
      parent,
      confirmation({
        result: "INCONCLUSIVO",
        notes: "baixa cobertura",
        sequences: [{ marker: "COI", pctIdentity: 99.1 }, { accession: "OK123456" }],
      }),
    )
    expect(arg(m("analysis", "create")).data).toMatchObject({
      result: "INCONCLUSIVO",
      notes: "baixa cobertura",
    })
    expect(arg(m("sequenceRecord", "createMany")).data).toEqual([
      {
        analysisId: "an-2",
        marker: "COI",
        accession: null,
        pctIdentity: 99.1,
        consensus: null,
        platform: null,
      },
      {
        analysisId: "an-2",
        marker: null,
        accession: "OK123456",
        pctIdentity: null,
        consensus: null,
        platform: null,
      },
    ])
  })

  it.each([
    ["criar", () => createConfirmation(parent, body), "create"],
    ["editar", () => updateConfirmation("an-2", body), "update"],
  ])("%s a mesma espécie+exame na amostra vira conflito (P2002)", async (_label, run, method) => {
    m("analysis", method).mockRejectedValue(prismaError("P2002"))
    await expect(run()).rejects.toMatchObject({
      name: "ConflictError",
      code: "confirmationDuplicate",
    })
  })

  it("outros erros do banco não são mascarados como duplicata", async () => {
    m("analysis", "create").mockRejectedValue(prismaError("P2003"))
    await expect(createConfirmation(parent, body)).rejects.toMatchObject({ code: "P2003" })
    m("analysis", "update").mockRejectedValue(new Error("conexão caiu"))
    await expect(updateConfirmation("an-2", body)).rejects.toThrow("conexão caiu")
  })

  it("editar SUBSTITUI o conjunto de sequências (apaga as antigas antes de inserir)", async () => {
    m("analysis", "findUniqueOrThrow").mockResolvedValue({ id: "an-2" })
    await updateConfirmation("an-2", confirmation({ sequences: [{ marker: "16S" }] }))

    expect(arg(m("analysis", "update"))).toEqual({
      where: { id: "an-2" },
      data: { pathogenId: "p-especie", examTypeId: "e-seq", result: "POSITIVO", notes: null },
    })
    expect(arg(m("sequenceRecord", "deleteMany"))).toEqual({ where: { analysisId: "an-2" } })
    const deleteOrder = m("sequenceRecord", "deleteMany").mock.invocationCallOrder[0]!
    const insertOrder = m("sequenceRecord", "createMany").mock.invocationCallOrder[0]!
    expect(deleteOrder).toBeLessThan(insertOrder)
    expect(
      arg<{ data: { marker: string }[] }>(m("sequenceRecord", "createMany")).data[0]?.marker,
    ).toBe("16S")
  })

  it("editar para zero sequências apaga as antigas e não insere nenhuma", async () => {
    await updateConfirmation("an-2", body)
    expect(m("sequenceRecord", "deleteMany")).toHaveBeenCalledTimes(1)
    expect(m("sequenceRecord", "createMany")).not.toHaveBeenCalled()
  })

  it("remover apaga só a confirmação informada", async () => {
    await deleteConfirmation("an-2")
    expect(arg(m("analysis", "delete"))).toEqual({ where: { id: "an-2" } })
  })
})

describe("laudo — helpers puros", () => {
  it("toScreening renomeia a relação para 'interactions' e preserva o tri-estado", () => {
    expect(
      toScreening({
        anthropicInteraction: true,
        giContentCollected: null,
        giSolidWaste: false,
        giDetailedScreening: null,
        anthropicInteractions: [{ type: "FISHERY", degree: 2 }],
      }),
    ).toEqual({
      anthropicInteraction: true,
      giContentCollected: null,
      giSolidWaste: false,
      giDetailedScreening: null,
      interactions: [{ type: "FISHERY", degree: 2 }],
    })
  })

  it("interações no log de auditoria: valores canônicos, ordem estável, sem mutar a entrada", () => {
    const input = [
      { type: "VESSEL", degree: 1 },
      { type: "FISHERY", degree: 2 },
    ]
    expect(interactionsAuditValue(input)).toBe("FISHERY:2, VESSEL:1")
    expect(input[0]?.type).toBe("VESSEL")
    // A mesma lista em outra ordem gera o mesmo texto: reordenar não é uma alteração.
    expect(interactionsAuditValue([...input].reverse())).toBe("FISHERY:2, VESSEL:1")
  })

  it("lista vazia é null (campo vazio no log), não string vazia", () => {
    expect(interactionsAuditValue([])).toBeNull()
  })

  it("trocar o estado de um sistema com achados é conflito e informa quantos há", () => {
    const err = findingsPresentError(3)
    expect(err.name).toBe("ConflictError")
    expect(err.code).toBe("necropsyFindingsPresent")
    expect(err.params).toEqual({ count: "3" })
  })
})

describe("laudo — consultas", () => {
  it.each([
    ["exame de sistema", loadSystemExam, "necropsySystemExam", "necropsyExamNotFound"],
    ["achado macroscópico", loadGrossFinding, "grossFinding", "necropsyFindingNotFound"],
    [
      "achado histopatológico",
      loadHistopathologyFinding,
      "histopathologyFinding",
      "histopathologyFindingNotFound",
    ],
  ] as const)("%s inexistente vira 404 com código próprio", async (_label, load, model, code) => {
    m(model, "findUnique").mockResolvedValue(null)
    await expect(load("x")).rejects.toMatchObject({ name: "NotFoundError", code })
  })

  it("o achado macro resolve o animal pelo exame de origem", async () => {
    m("grossFinding", "findUnique").mockResolvedValue({
      id: "g1",
      examId: "ex1",
      lesion: "úlcera",
      exam: { animalId: "a1", systemId: "s1" },
    })
    await expect(loadGrossFinding("g1")).resolves.toMatchObject({ id: "g1", animalId: "a1" })
  })

  it("exame e achado micro existentes são devolvidos como vieram", async () => {
    const exam = { id: "ex1", animalId: "a1", systemId: "s1", status: "ALTERED" }
    m("necropsySystemExam", "findUnique").mockResolvedValue(exam)
    await expect(loadSystemExam("ex1")).resolves.toBe(exam)
    const micro = { id: "h1", animalId: "a1", organId: "o1", finding: "edema" }
    m("histopathologyFinding", "findUnique").mockResolvedValue(micro)
    await expect(loadHistopathologyFinding("h1")).resolves.toBe(micro)
  })

  it.each([
    ["sistema", assertSystemExists, "necropsySystem", "systemNotFound"],
    ["órgão", assertOrganExists, "organ", "organNotFound"],
  ] as const)(
    "%s do catálogo: inexistente vira 404, existente passa",
    async (_l, check, model, code) => {
      m(model, "findUnique").mockResolvedValue(null)
      await expect(check("x")).rejects.toMatchObject({ code })
      m(model, "findUnique").mockResolvedValue({ id: "x" })
      await expect(check("x")).resolves.toBeUndefined()
    },
  )

  // A posição é atribuída no servidor, na ordem de entrada — o cliente não escolhe.
  it.each([
    ["sistema no laudo", nextSystemPosition, "necropsySystemExam", { animalId: "pai" }],
    ["achado macro no exame", nextGrossPosition, "grossFinding", { examId: "pai" }],
    [
      "achado micro no animal",
      nextHistopathologyPosition,
      "histopathologyFinding",
      { animalId: "pai" },
    ],
  ] as const)(
    "próxima posição de %s: 1 na lista vazia, senão a maior + 1",
    async (_l, next, model, where) => {
      m(model, "findFirst").mockResolvedValue(null)
      await expect(next("pai")).resolves.toBe(1)
      m(model, "findFirst").mockResolvedValue({ position: 7 })
      await expect(next("pai")).resolves.toBe(8)
      expect(arg(m(model, "findFirst"))).toMatchObject({ where, orderBy: { position: "desc" } })
    },
  )
})

describe("writeAudit", () => {
  it("sem alterações não grava nada", async () => {
    await writeAudit("Animal", "a1", "u1", [])
    expect(m("auditLog", "createMany")).not.toHaveBeenCalled()
  })

  it("grava uma linha por campo alterado, com entidade, registro e autor", async () => {
    await writeAudit("Sample", "s1", "u1", [
      { field: "status", oldValue: "STORED", newValue: "DEPLETED" },
      { field: "notes", oldValue: null, newValue: "consumida" },
    ])
    expect(arg(m("auditLog", "createMany")).data).toEqual([
      {
        field: "status",
        oldValue: "STORED",
        newValue: "DEPLETED",
        userId: "u1",
        entity: "Sample",
        entityId: "s1",
      },
      {
        field: "notes",
        oldValue: null,
        newValue: "consumida",
        userId: "u1",
        entity: "Sample",
        entityId: "s1",
      },
    ])
  })
})

describe("vocabulário da biometria (autocompletar do cadastro manual)", () => {
  const block = (group: string | null, labels: string[]) => ({
    measurements: { group, unit: "Cm", measures: labels.map((label) => ({ label, value: 1 })) },
  })

  it("grupos já usados na organização: sem repetição, em ordem alfabética, ignorando linhas malformadas", async () => {
    m("animal", "findMany").mockResolvedValue([
      block("Quelônio", ["a"]),
      block("Odontoceti", ["a"]),
      block("Quelônio", ["b"]),
      block(null, ["a"]),
      { measurements: "lixo" },
      { measurements: { group: "SemMedidas" } },
    ])
    await expect(knownGroups("org-a")).resolves.toEqual(["Odontoceti", "Quelônio"])
    expect(arg<{ where: { orgId: string } }>(m("animal", "findMany")).where.orgId).toBe("org-a")
  })

  // Rótulos de formulários diferentes não se misturam.
  it("sem grupo não há o que sugerir, e o banco nem é consultado", async () => {
    await expect(knownLabels("org-a", null)).resolves.toEqual([])
    await expect(knownLabels("org-a", "")).resolves.toEqual([])
    expect(m("animal", "findMany")).not.toHaveBeenCalled()
  })

  it("rótulos do grupo: união na ordem do formulário, restrita à organização e ao grupo", async () => {
    m("animal", "findMany").mockResolvedValue([
      block("Odontoceti", ["Comprimento total", "Peso total"]),
      { measurements: null },
      block("Odontoceti", ["Comprimento total", "Número de dentes"]),
    ])
    await expect(knownLabels("org-a", "Odontoceti")).resolves.toEqual([
      "Comprimento total",
      "Peso total",
      "Número de dentes",
    ])
    expect(arg(m("animal", "findMany")).where).toEqual({
      orgId: "org-a",
      measurements: { path: ["group"], equals: "Odontoceti" },
    })
  })
})
