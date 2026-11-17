// Glossário global (órgãos, exames, sistemas, patógenos) e a fila de solicitações de
// inclusão/edição. Banco simulado: o alvo são as regras — quem pode editar, o que conta como
// "em uso", nome científico só via NCBI, chave única, duplicata e auto-revisão.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"
import { ZodError } from "zod"

vi.mock("@/lib/prisma", async () => (await import("./helpers/prisma-mock")).prismaModule)

import { arg, m, prismaError, resetDb } from "./helpers/prisma-mock"
import {
  assertPathogenFromNcbi,
  canModifyCatalog,
  catalogCreatedBy,
  catalogExists,
  catalogUsage,
  catalogUsageBreakdown,
  catalogUsedIds,
  createCatalogItem,
  deleteCatalog,
  findDuplicate,
  keyExists,
  listNamed,
  listPathogenGroups,
  listPathogens,
  resolveMeasure,
  resolvePathogen,
  uniqueKey,
  updateCatalogItem,
} from "@/lib/catalog"
import {
  approveCatalogRequest,
  catalogTypeOf,
  countPendingRequests,
  createCatalogRequest,
  listMyRequests,
  listReviewableRequests,
  rejectCatalogRequest,
} from "@/lib/catalog-requests"

const TYPES = ["organs", "pathogens", "exam-types", "systems"] as const
const MODEL = {
  organs: "organ",
  pathogens: "pathogen",
  "exam-types": "examType",
  systems: "necropsySystem",
} as const

const sciGroup = () =>
  m("pathogenGroup", "findUnique").mockResolvedValue({ id: "g-sci", usesScientificName: true })
const commonGroup = () =>
  m("pathogenGroup", "findUnique").mockResolvedValue({ id: "g-comum", usesScientificName: false })
/** Nenhum item em uso e nenhuma chave ocupada. */
function emptyCatalog() {
  for (const model of ["researchProtocol", "sample", "analysis", "histopathologyFinding"]) {
    m(model, "findMany").mockResolvedValue([])
    m(model, "count").mockResolvedValue(0)
  }
  m("grossFinding", "findMany").mockResolvedValue([])
  m("grossFinding", "count").mockResolvedValue(0)
  m("necropsySystemExam", "findMany").mockResolvedValue([])
  m("necropsySystemExam", "count").mockResolvedValue(0)
}

beforeEach(() => resetDb())

describe("resolveMeasure — medida quantitativa do exame", () => {
  it("só há medida quando o rótulo vem em PT e EN", () => {
    expect(
      resolveMeasure({ measurePt: " Ct ", measureEn: " Ct ", measureUnit: " ciclos " }),
    ).toEqual({ label: { pt: "Ct", en: "Ct" }, unit: "ciclos" })
  })

  it.each([
    ["só PT", { measurePt: "Título" }],
    ["só EN", { measureEn: "Titer" }],
    ["EN em branco", { measurePt: "Título", measureEn: "  " }],
    ["nada", {}],
  ])("%s → exame qualitativo; a unidade sozinha é descartada", (_label, data) => {
    expect(resolveMeasure({ ...data, measureUnit: "UI/mL" })).toEqual({ label: null, unit: null })
  })

  it("medida sem unidade é válida (unidade null)", () => {
    expect(resolveMeasure({ measurePt: "Ct", measureEn: "Ct", measureUnit: " " }).unit).toBeNull()
  })
})

describe("assertPathogenFromNcbi", () => {
  // Nome científico digitado livremente (sem TaxId) é recusado: evita grafias divergentes.
  it("nome científico sem TaxId do NCBI é recusado", () => {
    expect(() => assertPathogenFromNcbi("Brucella ceti", null)).toThrow(
      expect.objectContaining({ name: "ValidationError", code: "pathogenNcbiRequired" }),
    )
  })

  it("com TaxId passa; grupos de nome comum não são afetados", () => {
    expect(() => assertPathogenFromNcbi("Brucella ceti", 120577)).not.toThrow()
    expect(() => assertPathogenFromNcbi(null, null)).not.toThrow()
    expect(() => assertPathogenFromNcbi("", null)).not.toThrow()
  })
})

describe("canModifyCatalog — quem edita/exclui um item", () => {
  const base = { isSystemAdmin: false, createdById: "u1", userId: "u1", usage: 0 }

  it.each([
    [
      "admin global, mesmo com o item em uso e de outro autor",
      { ...base, isSystemAdmin: true, createdById: "outro", usage: 9 },
      true,
    ],
    ["o criador, enquanto ninguém usa", base, true],
    ["o criador, depois que o item entrou em uso", { ...base, usage: 1 }, false],
    ["outro usuário", { ...base, userId: "u2" }, false],
    ["item sem autor (semente do sistema)", { ...base, createdById: null }, false],
  ])("%s → %s", (_label, opts, expected) => {
    expect(canModifyCatalog(opts)).toBe(expected)
  })
})

describe("resolvePathogen — regra por tipo de grupo", () => {
  it("grupo inexistente vira 404", async () => {
    m("pathogenGroup", "findUnique").mockResolvedValue(null)
    await expect(resolvePathogen({ groupId: "g-x" })).rejects.toMatchObject({
      name: "NotFoundError",
      code: "catalogNotFound",
    })
  })

  it("corpo sem grupo falha na validação antes de consultar", async () => {
    await expect(resolvePathogen({})).rejects.toBeInstanceOf(ZodError)
    expect(m("pathogenGroup", "findUnique")).not.toHaveBeenCalled()
  })

  it("grupo científico: exige o nome científico e normaliza o táxon", async () => {
    sciGroup()
    await expect(
      resolvePathogen({
        groupId: "g-sci",
        scientificName: "  Brucella ceti ",
        namePt: "ignorado",
        taxonFamily: " Brucellaceae ",
        taxonOrder: "",
        taxonRank: " Species ",
        taxonId: 120577,
      }),
    ).resolves.toEqual({
      groupId: "g-sci",
      scientificName: "Brucella ceti",
      name: null,
      taxon: {
        taxonFamily: "Brucellaceae",
        taxonOrder: null,
        taxonRank: "species",
        taxonId: 120577,
      },
      keySource: "Brucella ceti",
    })
  })

  it("grupo científico sem nome científico é recusado", async () => {
    sciGroup()
    await expect(
      resolvePathogen({ groupId: "g-sci", scientificName: "  ", namePt: "x", nameEn: "y" }),
    ).rejects.toMatchObject({ name: "ValidationError", code: "catalogNameRequired" })
  })

  it("grupo de nome comum: exige PT e EN e descarta qualquer táxon enviado", async () => {
    commonGroup()
    await expect(
      resolvePathogen({
        groupId: "g-comum",
        namePt: " Morbilivírus ",
        nameEn: " Morbillivirus ",
        scientificName: "ignorado",
        taxonId: 99,
        taxonFamily: "x",
      }),
    ).resolves.toEqual({
      groupId: "g-comum",
      scientificName: null,
      name: { pt: "Morbilivírus", en: "Morbillivirus" },
      taxon: { taxonFamily: null, taxonOrder: null, taxonRank: null, taxonId: null },
      keySource: "Morbilivírus",
    })
  })

  it.each([
    ["sem EN", { namePt: "Morbilivírus" }],
    ["sem PT", { nameEn: "Morbillivirus" }],
  ])("grupo de nome comum %s é recusado", async (_label, names) => {
    commonGroup()
    await expect(resolvePathogen({ groupId: "g-comum", ...names })).rejects.toMatchObject({
      code: "catalogNameRequired",
    })
  })
})

describe("chave única do item", () => {
  it("usa o slug do nome quando está livre", async () => {
    m("organ", "findUnique").mockResolvedValue(null)
    await expect(uniqueKey("organs", "Fígado")).resolves.toBe("figado")
  })

  it("chave ocupada recebe sufixo crescente até achar uma livre", async () => {
    m("organ", "findUnique")
      .mockResolvedValueOnce({ id: "1" })
      .mockResolvedValueOnce({ id: "2" })
      .mockResolvedValueOnce(null)
    await expect(uniqueKey("organs", "Fígado")).resolves.toBe("figado_3")
    expect(
      m("organ", "findUnique").mock.calls.map(
        (c) => (c[0] as { where: { key: string } }).where.key,
      ),
    ).toEqual(["figado", "figado_2", "figado_3"])
  })

  it("nome sem nenhum caractere aproveitável vira 'item'", async () => {
    m("examType", "findUnique").mockResolvedValue(null)
    await expect(uniqueKey("exam-types", "???")).resolves.toBe("item")
  })

  it.each(TYPES)("%s: existência por chave e por id consultam a tabela certa", async (type) => {
    m(MODEL[type], "findUnique").mockResolvedValue({ id: "x" })
    await expect(keyExists(type, "k")).resolves.toBe(true)
    await expect(catalogExists(type, "x")).resolves.toBe(true)
    await expect(catalogCreatedBy(type, "x")).resolves.toEqual({ id: "x" })
    m(MODEL[type], "findUnique").mockResolvedValue(null)
    await expect(keyExists(type, "k")).resolves.toBe(false)
    await expect(catalogExists(type, "x")).resolves.toBe(false)
    for (const t of TYPES) {
      if (t !== type) expect(m(MODEL[t], "findUnique")).not.toHaveBeenCalled()
    }
  })

  it.each(TYPES)("%s: exclusão atinge só a tabela do tipo", async (type) => {
    await deleteCatalog(type, "x")
    expect(arg(m(MODEL[type], "delete"))).toEqual({ where: { id: "x" } })
    for (const t of TYPES) if (t !== type) expect(m(MODEL[t], "delete")).not.toHaveBeenCalled()
  })
})

describe("item 'em uso' (bloqueia a exclusão)", () => {
  // O laudo também cita o órgão: sem contar os achados, daria para excluir um órgão com um
  // laudo apontando para ele.
  it("órgão: protocolos + amostras + achados micro + achados macro", async () => {
    m("researchProtocol", "count").mockResolvedValue(1)
    m("sample", "count").mockResolvedValue(2)
    m("histopathologyFinding", "count").mockResolvedValue(4)
    m("grossFinding", "count").mockResolvedValue(8)
    await expect(catalogUsage("organs", "o1")).resolves.toBe(15)
    for (const model of ["researchProtocol", "sample", "histopathologyFinding", "grossFinding"]) {
      expect(arg(m(model, "count")).where).toEqual({ organId: "o1" })
    }
  })

  it.each([
    ["pathogens", "pathogenId"],
    ["exam-types", "examTypeId"],
  ] as const)("%s: protocolos + análises, pela coluna %s", async (type, field) => {
    m("researchProtocol", "count").mockResolvedValue(2)
    m("analysis", "count").mockResolvedValue(3)
    await expect(catalogUsage(type, "x")).resolves.toBe(5)
    expect(arg(m("researchProtocol", "count")).where).toEqual({ [field]: "x" })
    expect(arg(m("analysis", "count")).where).toEqual({ [field]: "x" })
  })

  it("sistema: citado por algum laudo", async () => {
    m("necropsySystemExam", "count").mockResolvedValue(6)
    await expect(catalogUsage("systems", "s1")).resolves.toBe(6)
    expect(arg(m("necropsySystemExam", "count")).where).toEqual({ systemId: "s1" })
  })

  it("ids em uso de órgãos: união das quatro fontes, ignorando achado macro sem órgão", async () => {
    m("researchProtocol", "findMany").mockResolvedValue([{ organId: "o1" }])
    m("sample", "findMany").mockResolvedValue([{ organId: "o2" }, { organId: "o1" }])
    m("histopathologyFinding", "findMany").mockResolvedValue([{ organId: "o3" }])
    m("grossFinding", "findMany").mockResolvedValue([{ organId: "o4" }, { organId: null }])
    const used = await catalogUsedIds("organs")
    expect([...used].sort()).toEqual(["o1", "o2", "o3", "o4"])
  })

  it("ids em uso de patógenos, exames e sistemas", async () => {
    m("researchProtocol", "findMany").mockResolvedValue([{ pathogenId: "p1", examTypeId: "e1" }])
    m("analysis", "findMany").mockResolvedValue([{ pathogenId: "p2", examTypeId: "e1" }])
    m("necropsySystemExam", "findMany").mockResolvedValue([{ systemId: "s1" }])
    expect([...(await catalogUsedIds("pathogens"))].sort()).toEqual(["p1", "p2"])
    expect([...(await catalogUsedIds("exam-types"))]).toEqual(["e1"])
    expect([...(await catalogUsedIds("systems"))]).toEqual(["s1"])
  })

  it("a listagem marca inUse por item e normaliza a medida (órgão não tem)", async () => {
    emptyCatalog()
    m("organ", "findMany").mockResolvedValue([
      { id: "o1", key: "baco", name: { pt: "Baço", en: "Spleen" }, createdById: null },
      { id: "o2", key: "figado", name: { pt: "Fígado", en: "Liver" }, createdById: "u1" },
    ])
    m("sample", "findMany").mockResolvedValue([{ organId: "o2" }])
    const rows = await listNamed("organs")
    expect(rows.map((r) => [r.id, r.inUse])).toEqual([
      ["o1", false],
      ["o2", true],
    ])
    expect(rows[0]).toMatchObject({ measureLabel: null, measureUnit: null })
  })

  it("exames trazem a medida; sistemas e exames consultam as próprias tabelas", async () => {
    emptyCatalog()
    m("examType", "findMany").mockResolvedValue([
      {
        id: "e1",
        key: "pcr",
        name: { pt: "PCR", en: "PCR" },
        createdById: null,
        measureLabel: { pt: "Ct", en: "Ct" },
        measureUnit: "ciclos",
      },
    ])
    m("necropsySystem", "findMany").mockResolvedValue([])
    const [exam] = await listNamed("exam-types")
    expect(exam).toMatchObject({ measureLabel: { pt: "Ct", en: "Ct" }, measureUnit: "ciclos" })
    await expect(listNamed("systems")).resolves.toEqual([])
    expect(m("organ", "findMany")).not.toHaveBeenCalled()
  })

  it("patógenos: inUse por protocolo ou análise; grupos em ordem de chave", async () => {
    emptyCatalog()
    m("pathogen", "findMany").mockResolvedValue([{ id: "p1" }, { id: "p2" }])
    m("analysis", "findMany").mockResolvedValue([{ pathogenId: "p2" }])
    const rows = await listPathogens()
    expect(rows.map((r) => r.inUse)).toEqual([false, true])

    m("pathogenGroup", "findMany").mockResolvedValue([])
    await listPathogenGroups()
    expect(arg(m("pathogenGroup", "findMany")).orderBy).toEqual({ key: "asc" })
  })
})

describe("indicador de uso — só contagens de distintos, nunca ids", () => {
  it("órgão: pesquisas e grupos distintos entre protocolos e amostras", async () => {
    m("researchProtocol", "findMany").mockResolvedValue([
      { researchId: "r1", research: { orgId: "org-a" } },
      { researchId: "r2", research: { orgId: "org-a" } },
    ])
    m("sample", "findMany").mockResolvedValue([
      { researchId: "r2", orgId: "org-a" },
      { researchId: "r3", orgId: "org-b" },
    ])
    await expect(catalogUsageBreakdown("organs", "o1")).resolves.toEqual({ researches: 3, orgs: 2 })
    expect(arg(m("researchProtocol", "findMany")).where).toEqual({ organId: "o1" })
    expect(m("analysis", "findMany")).not.toHaveBeenCalled()
  })

  it.each([
    ["pathogens", "pathogenId"],
    ["exam-types", "examTypeId"],
  ] as const)("%s: protocolos + análises (pela amostra)", async (type, field) => {
    m("researchProtocol", "findMany").mockResolvedValue([
      { researchId: "r1", research: { orgId: "org-a" } },
    ])
    m("analysis", "findMany").mockResolvedValue([
      { sample: { researchId: "r1", orgId: "org-a" } },
      { sample: { researchId: "r9", orgId: "org-z" } },
    ])
    await expect(catalogUsageBreakdown(type, "x")).resolves.toEqual({ researches: 2, orgs: 2 })
    expect(arg(m("analysis", "findMany")).where).toEqual({ [field]: "x" })
  })

  it("item sem nenhuma referência: zero pesquisas, zero grupos", async () => {
    m("researchProtocol", "findMany").mockResolvedValue([])
    m("analysis", "findMany").mockResolvedValue([])
    await expect(catalogUsageBreakdown("pathogens", "p1")).resolves.toEqual({
      researches: 0,
      orgs: 0,
    })
  })

  // BUG (src/lib/catalog.ts:533-535 e 565-575): `fieldFor` não trata "systems" e cai em
  // "examTypeId". Para um SISTEMA em uso, o indicador consulta protocolos e análises pela
  // coluna de exame com o id do sistema — nunca olha NecropsySystemExam — e responde sempre
  // { researches: 0, orgs: 0 } (GET /api/catalog/systems/[id]/usage aceita o tipo).
  it.fails(
    "sistema: o indicador conta os laudos que o citam, não protocolos/análises de exame",
    async () => {
      m("researchProtocol", "findMany").mockResolvedValue([])
      m("analysis", "findMany").mockResolvedValue([])
      m("necropsySystemExam", "findMany").mockResolvedValue([
        { animal: { researchId: "r1", orgId: "org-a", research: { orgId: "org-a" } } },
      ])
      const usage = await catalogUsageBreakdown("systems", "s1")
      expect(m("necropsySystemExam", "findMany")).toHaveBeenCalled()
      expect(usage.researches).toBeGreaterThan(0)
    },
  )
})

describe("createCatalogItem / updateCatalogItem", () => {
  it("órgão: chave pelo nome PT, nomes aparados e autoria gravada", async () => {
    m("organ", "findUnique").mockResolvedValue(null)
    m("organ", "create").mockResolvedValue({
      id: "o1",
      key: "figado",
      name: { pt: "Fígado", en: "Liver" },
      createdById: "u1",
    })
    const row = await createCatalogItem("organs", { namePt: " Fígado ", nameEn: " Liver " }, "u1")
    expect(arg(m("organ", "create")).data).toEqual({
      key: "figado",
      name: { pt: "Fígado", en: "Liver" },
      createdById: "u1",
    })
    expect(row).toMatchObject({ id: "o1", inUse: false, measureLabel: null })
  })

  it("sistema vai para a tabela de sistemas", async () => {
    m("necropsySystem", "findUnique").mockResolvedValue(null)
    m("necropsySystem", "create").mockResolvedValue({
      id: "s1",
      key: "k",
      name: {},
      createdById: "u1",
    })
    await createCatalogItem("systems", { namePt: "Respiratório", nameEn: "Respiratory" }, "u1")
    expect(arg<{ data: { key: string } }>(m("necropsySystem", "create")).data.key).toBe(
      "respiratorio",
    )
    expect(m("organ", "create")).not.toHaveBeenCalled()
  })

  it("exame qualitativo grava a medida como NULL de banco; quantitativo grava rótulo e unidade", async () => {
    m("examType", "findUnique").mockResolvedValue(null)
    m("examType", "create").mockResolvedValue({ id: "e1", key: "pcr", name: {}, createdById: "u1" })
    await createCatalogItem("exam-types", { namePt: "PCR", nameEn: "PCR" }, "u1")
    const qualitative = arg<{ data: Record<string, unknown> }>(m("examType", "create")).data
    expect(qualitative.measureLabel).toBe(Prisma.DbNull)
    expect(qualitative.measureUnit).toBeNull()

    await createCatalogItem(
      "exam-types",
      { namePt: "qPCR", nameEn: "qPCR", measurePt: "Ct", measureEn: "Ct", measureUnit: "ciclos" },
      "u1",
    )
    const quantitative = arg<{ data: Record<string, unknown> }>(m("examType", "create"), 1).data
    expect(quantitative.measureLabel).toEqual({ pt: "Ct", en: "Ct" })
    expect(quantitative.measureUnit).toBe("ciclos")
  })

  it("patógeno científico sem TaxId é recusado antes de gravar", async () => {
    sciGroup()
    await expect(
      createCatalogItem("pathogens", { groupId: "g-sci", scientificName: "Brucella ceti" }, "u1"),
    ).rejects.toMatchObject({ code: "pathogenNcbiRequired" })
    expect(m("pathogen", "create")).not.toHaveBeenCalled()
  })

  it("patógeno científico com TaxId: chave pelo nome científico, nome comum nulo", async () => {
    sciGroup()
    m("pathogen", "findUnique").mockResolvedValue(null)
    m("pathogen", "create").mockResolvedValue({ id: "p1" })
    const row = await createCatalogItem(
      "pathogens",
      { groupId: "g-sci", scientificName: "Brucella ceti", taxonId: 120577, taxonRank: "Species" },
      "u1",
    )
    expect(arg(m("pathogen", "create")).data).toEqual({
      key: "brucella_ceti",
      groupId: "g-sci",
      scientificName: "Brucella ceti",
      name: Prisma.DbNull,
      taxonFamily: null,
      taxonOrder: null,
      taxonRank: "species",
      taxonId: 120577,
      createdById: "u1",
    })
    expect(row).toMatchObject({ id: "p1", inUse: false })
  })

  it("patógeno de nome comum dispensa o NCBI", async () => {
    commonGroup()
    m("pathogen", "findUnique").mockResolvedValue(null)
    m("pathogen", "create").mockResolvedValue({ id: "p2" })
    await createCatalogItem(
      "pathogens",
      { groupId: "g-comum", namePt: "Morbilivírus", nameEn: "Morbillivirus" },
      "u1",
    )
    expect(arg(m("pathogen", "create")).data).toMatchObject({
      key: "morbilivirus",
      scientificName: null,
      name: { pt: "Morbilivírus", en: "Morbillivirus" },
      taxonId: null,
    })
  })

  it.each(["organs", "exam-types", "systems"] as const)(
    "%s: nome já existente (índice único) vira conflito de duplicata",
    async (type) => {
      m(MODEL[type], "findUnique").mockResolvedValue(null)
      m(MODEL[type], "create").mockRejectedValue(prismaError("P2002"))
      await expect(
        createCatalogItem(type, { namePt: "Fígado", nameEn: "Liver" }, "u1"),
      ).rejects.toMatchObject({ name: "ConflictError", code: "catalogDuplicate" })
    },
  )

  it("corpo inválido sobe como erro de validação; outros erros do banco não viram duplicata", async () => {
    await expect(createCatalogItem("organs", { namePt: "" }, "u1")).rejects.toBeInstanceOf(ZodError)
    m("organ", "findUnique").mockResolvedValue(null)
    m("organ", "create").mockRejectedValue(prismaError("P2003"))
    await expect(
      createCatalogItem("organs", { namePt: "Fígado", nameEn: "Liver" }, "u1"),
    ).rejects.toMatchObject({ code: "P2003" })
  })

  it("editar órgão troca só o nome (a chave é estável) e recalcula inUse", async () => {
    emptyCatalog()
    m("sample", "count").mockResolvedValue(1)
    m("organ", "update").mockResolvedValue({ id: "o1", key: "figado", name: {}, createdById: "u1" })
    const row = await updateCatalogItem("organs", "o1", { namePt: " Fígado ", nameEn: " Liver " })
    expect(arg(m("organ", "update"))).toMatchObject({
      where: { id: "o1" },
      data: { name: { pt: "Fígado", en: "Liver" } },
    })
    expect(row.inUse).toBe(true)
  })

  it("editar exame regrava a medida; editar sistema usa a tabela de sistemas", async () => {
    emptyCatalog()
    m("examType", "update").mockResolvedValue({ id: "e1", key: "pcr", name: {}, createdById: null })
    await updateCatalogItem("exam-types", "e1", { namePt: "PCR", nameEn: "PCR" })
    expect(arg<{ data: Record<string, unknown> }>(m("examType", "update")).data.measureLabel).toBe(
      Prisma.DbNull,
    )

    m("necropsySystem", "update").mockResolvedValue({
      id: "s1",
      key: "k",
      name: {},
      createdById: null,
    })
    const row = await updateCatalogItem("systems", "s1", { namePt: "Renal", nameEn: "Renal" })
    expect(m("necropsySystem", "update")).toHaveBeenCalledTimes(1)
    expect(row.inUse).toBe(false)
  })

  it("editar patógeno aplica os dados resolvidos e informa se está em uso", async () => {
    commonGroup()
    m("pathogen", "update").mockResolvedValue({ id: "p1" })
    m("researchProtocol", "count").mockResolvedValue(0)
    m("analysis", "count").mockResolvedValue(2)
    const row = await updateCatalogItem("pathogens", "p1", {
      groupId: "g-comum",
      namePt: "Morbilivírus",
      nameEn: "Morbillivirus",
    })
    expect(arg(m("pathogen", "update"))).toMatchObject({
      where: { id: "p1" },
      data: { groupId: "g-comum", scientificName: null, taxonId: null },
    })
    expect(row.inUse).toBe(true)
  })

  it("edição que colide com outro nome vira conflito de duplicata", async () => {
    m("organ", "update").mockRejectedValue(prismaError("P2002"))
    await expect(
      updateCatalogItem("organs", "o1", { namePt: "Baço", nameEn: "Spleen" }),
    ).rejects.toMatchObject({ code: "catalogDuplicate" })
    m("organ", "update").mockRejectedValue(prismaError("P2025"))
    await expect(
      updateCatalogItem("organs", "o1", { namePt: "Baço", nameEn: "Spleen" }),
    ).rejects.toMatchObject({ code: "P2025" })
  })
})

describe("findDuplicate — item existente com o mesmo nome normalizado", () => {
  it("órgão: casa por PT ou EN, ignorando acento e caixa", async () => {
    emptyCatalog()
    m("organ", "findMany").mockResolvedValue([
      { id: "o1", key: "baco", name: { pt: "Baço", en: "Spleen" }, createdById: null },
      { id: "o2", key: "figado", name: { pt: "Fígado", en: "Liver" }, createdById: null },
      { id: "o3", key: "lixo", name: "formato antigo", createdById: null },
    ])
    await expect(findDuplicate("organs", { namePt: "FIGADO", nameEn: "outro" })).resolves.toBe("o2")
    await expect(findDuplicate("organs", { namePt: "outro", nameEn: "spleen" })).resolves.toBe("o1")
    await expect(findDuplicate("organs", { namePt: "Rim", nameEn: "Kidney" })).resolves.toBeNull()
  })

  it("exame usa o schema de exame (aceita os campos de medida)", async () => {
    emptyCatalog()
    m("examType", "findMany").mockResolvedValue([
      { id: "e1", key: "pcr", name: { pt: "PCR", en: "PCR" }, createdById: null },
    ])
    await expect(
      findDuplicate("exam-types", { namePt: "pcr", nameEn: "pcr", measureUnit: "x" }),
    ).resolves.toBe("e1")
  })

  it("patógeno: casa pelo nome científico ou pelo nome comum", async () => {
    emptyCatalog()
    m("pathogen", "findMany").mockResolvedValue([
      { id: "p1", scientificName: "Brucella ceti", name: null },
      { id: "p2", scientificName: null, name: { pt: "Morbilivírus", en: "Morbillivirus" } },
    ])
    sciGroup()
    await expect(
      findDuplicate("pathogens", { groupId: "g-sci", scientificName: "brucella CETI" }),
    ).resolves.toBe("p1")
    commonGroup()
    await expect(
      findDuplicate("pathogens", { groupId: "g-comum", namePt: "x", nameEn: "MORBILLIVIRUS" }),
    ).resolves.toBe("p2")
    await expect(
      findDuplicate("pathogens", { groupId: "g-comum", namePt: "Novo", nameEn: "New" }),
    ).resolves.toBeNull()
  })
})

// ── Solicitações de glossário ────────────────────────────────────────────────

describe("createCatalogRequest", () => {
  const who = { userId: "u1", userEmail: "ana@test.local", orgId: "org-a", orgName: "LabMar" }
  const organ = { namePt: "Fígado", nameEn: "Liver" }

  it("mapeia o tipo do enum de volta para o catálogo", () => {
    expect(catalogTypeOf("ORGAN")).toBe("organs")
    expect(catalogTypeOf("EXAM_TYPE")).toBe("exam-types")
    expect(catalogTypeOf("PATHOGEN")).toBe("pathogens")
    expect(catalogTypeOf("SYSTEM")).toBe("systems")
  })

  it("inclusão: grava o payload validado com o snapshot de autor e grupo", async () => {
    m("catalogRequest", "findMany").mockResolvedValue([])
    m("catalogRequest", "create").mockResolvedValue({ id: "q1" })
    await createCatalogRequest({
      type: "organs",
      payload: { ...organ, extra: "descartado" },
      ...who,
    })
    expect(arg(m("catalogRequest", "create")).data).toEqual({
      type: "ORGAN",
      targetId: null,
      payload: organ,
      requestedById: "u1",
      requestedByEmail: "ana@test.local",
      orgId: "org-a",
      orgName: "LabMar",
    })
  })

  it("payload inválido é recusado antes de qualquer gravação", async () => {
    await expect(
      createCatalogRequest({ type: "organs", payload: { namePt: "Fígado" }, ...who }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(m("catalogRequest", "create")).not.toHaveBeenCalled()
  })

  it("patógeno científico sem seleção do NCBI é recusado já na solicitação", async () => {
    await expect(
      createCatalogRequest({
        type: "pathogens",
        payload: { groupId: "g-sci", scientificName: "Brucella ceti" },
        ...who,
      }),
    ).rejects.toMatchObject({ code: "pathogenNcbiRequired" })
  })

  // Mesmo autor + mesmo tipo + mesmo nome (sem acento/caixa) ainda pendente.
  it("bloqueia solicitação pendente idêntica do próprio autor", async () => {
    m("catalogRequest", "findMany").mockResolvedValue([
      { payload: { namePt: "outro", nameEn: "LIVER" } },
    ])
    await expect(
      createCatalogRequest({ type: "organs", payload: organ, ...who }),
    ).rejects.toMatchObject({ name: "ConflictError", code: "catalogRequestDuplicatePending" })
    expect(arg(m("catalogRequest", "findMany")).where).toEqual({
      requestedById: "u1",
      type: "ORGAN",
      status: "PENDING",
    })
  })

  it("patógeno: a colisão é pelo nome científico quando ele existe", async () => {
    m("catalogRequest", "findMany").mockResolvedValue([
      { payload: { scientificName: "Brucella CETI", namePt: "" } },
    ])
    await expect(
      createCatalogRequest({
        type: "pathogens",
        payload: { groupId: "g", scientificName: "Brucella ceti", taxonId: 120577 },
        ...who,
      }),
    ).rejects.toMatchObject({ code: "catalogRequestDuplicatePending" })
  })

  it("pendente de nome diferente não bloqueia", async () => {
    m("catalogRequest", "findMany").mockResolvedValue([
      { payload: { namePt: "Baço", nameEn: "Spleen" } },
    ])
    m("catalogRequest", "create").mockResolvedValue({ id: "q1" })
    await expect(createCatalogRequest({ type: "organs", payload: organ, ...who })).resolves.toEqual(
      { id: "q1" },
    )
  })

  it("edição: o alvo precisa existir NO TIPO pedido", async () => {
    m("organ", "findUnique").mockResolvedValue(null)
    await expect(
      createCatalogRequest({ type: "organs", payload: organ, targetId: "id-de-exame", ...who }),
    ).rejects.toMatchObject({ name: "NotFoundError", code: "catalogNotFound" })
  })

  // Duas edições concorrentes do mesmo item se sobrescreveriam na aprovação.
  it("edição: já havendo proposta pendente para o item (de qualquer autor), recusa", async () => {
    m("organ", "findUnique").mockResolvedValue({ id: "o1" })
    m("catalogRequest", "count").mockResolvedValue(1)
    await expect(
      createCatalogRequest({ type: "organs", payload: organ, targetId: "o1", ...who }),
    ).rejects.toMatchObject({ code: "catalogRequestDuplicatePending" })
    expect(arg(m("catalogRequest", "count")).where).toEqual({ targetId: "o1", status: "PENDING" })
  })

  it("edição sem concorrente: grava o alvo e não aplica a deduplicação por nome", async () => {
    m("organ", "findUnique").mockResolvedValue({ id: "o1" })
    m("catalogRequest", "count").mockResolvedValue(0)
    m("catalogRequest", "create").mockResolvedValue({ id: "q2" })
    await createCatalogRequest({
      type: "organs",
      payload: organ,
      targetId: "o1",
      ...who,
      orgId: null,
      orgName: null,
    })
    expect(m("catalogRequest", "findMany")).not.toHaveBeenCalled()
    expect(arg(m("catalogRequest", "create")).data).toMatchObject({ targetId: "o1", orgId: null })
  })
})

describe("listagens de solicitações", () => {
  it("fila pendente: mais antigas primeiro; histórico: mais recentes primeiro", async () => {
    m("catalogRequest", "findMany").mockResolvedValue([])
    await listReviewableRequests("PENDING")
    expect(arg(m("catalogRequest", "findMany"))).toMatchObject({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    })
    await listReviewableRequests("APPROVED")
    expect(arg(m("catalogRequest", "findMany"), 1).orderBy).toEqual({ createdAt: "desc" })
    await listReviewableRequests()
    expect(arg(m("catalogRequest", "findMany"), 2).where).toBeUndefined()
  })

  it("as minhas solicitações e a contagem de pendentes", async () => {
    m("catalogRequest", "findMany").mockResolvedValue([])
    await listMyRequests("u1")
    expect(arg(m("catalogRequest", "findMany")).where).toEqual({ requestedById: "u1" })
    m("catalogRequest", "count").mockResolvedValue(4)
    await expect(countPendingRequests()).resolves.toBe(4)
    expect(arg(m("catalogRequest", "count")).where).toEqual({ status: "PENDING" })
  })
})

describe("curadoria das solicitações", () => {
  const request = (over: Record<string, unknown> = {}) => ({
    id: "q1",
    type: "ORGAN",
    payload: { namePt: "Fígado", nameEn: "Liver" },
    status: "PENDING",
    requestedById: "u-autor",
    targetId: null,
    ...over,
  })
  const organCreated = () => {
    m("organ", "findUnique").mockResolvedValue(null)
    m("organ", "create").mockResolvedValue({
      id: "o-novo",
      key: "figado",
      name: {},
      createdById: "u-autor",
    })
  }

  it.each([
    ["aprovar", () => approveCatalogRequest("q0", "u-rev")],
    ["rejeitar", () => rejectCatalogRequest("q0", "u-rev", null)],
  ])("%s solicitação inexistente vira 404", async (_label, run) => {
    m("catalogRequest", "findUnique").mockResolvedValue(null)
    await expect(run()).rejects.toMatchObject({ code: "catalogRequestNotFound" })
  })

  it.each([
    ["aprovar", () => approveCatalogRequest("q1", "u-rev")],
    ["rejeitar", () => rejectCatalogRequest("q1", "u-rev", null)],
  ])("%s solicitação já processada é conflito", async (_label, run) => {
    m("catalogRequest", "findUnique").mockResolvedValue(request({ status: "REJECTED" }))
    await expect(run()).rejects.toMatchObject({
      name: "ConflictError",
      code: "catalogRequestProcessed",
    })
    expect(m("catalogRequest", "updateMany")).not.toHaveBeenCalled()
  })

  // Integridade: mesmo que o autor tenha virado admin depois, não revisa o próprio pedido.
  it.each([
    ["aprovar", () => approveCatalogRequest("q1", "u-autor")],
    ["rejeitar", () => rejectCatalogRequest("q1", "u-autor", "x")],
  ])("ninguém pode %s a própria solicitação", async (_label, run) => {
    m("catalogRequest", "findUnique").mockResolvedValue(request())
    await expect(run()).rejects.toMatchObject({
      name: "ForbiddenError",
      code: "catalogRequestSelfReview",
    })
    expect(m("organ", "create")).not.toHaveBeenCalled()
    expect(m("catalogRequest", "updateMany")).not.toHaveBeenCalled()
  })

  it("aprovar inclusão cria o item em nome do AUTOR e fecha a solicitação com trava por status", async () => {
    m("catalogRequest", "findUnique").mockResolvedValue(request())
    organCreated()
    await expect(approveCatalogRequest("q1", "u-rev")).resolves.toEqual({ createdItemId: "o-novo" })
    expect(arg<{ data: { createdById: string } }>(m("organ", "create")).data.createdById).toBe(
      "u-autor",
    )
    const upd = arg<{ where: unknown; data: Record<string, unknown> }>(
      m("catalogRequest", "updateMany"),
    )
    expect(upd.where).toEqual({ id: "q1", status: "PENDING" })
    expect(upd.data).toMatchObject({
      status: "APPROVED",
      reviewedById: "u-rev",
      createdItemId: "o-novo",
    })
    expect(upd.data.reviewedAt).toBeInstanceOf(Date)
  })

  it("autor já excluído (conta removida): o item fica em nome de quem aprovou", async () => {
    m("catalogRequest", "findUnique").mockResolvedValue(request({ requestedById: null }))
    organCreated()
    await approveCatalogRequest("q1", "u-rev")
    expect(arg<{ data: { createdById: string } }>(m("organ", "create")).data.createdById).toBe(
      "u-rev",
    )
  })

  it("aprovar edição aplica no item apontado, sem criar outro", async () => {
    m("catalogRequest", "findUnique").mockResolvedValue(request({ targetId: "o1" }))
    m("organ", "findUnique").mockResolvedValue({ id: "o1" })
    m("organ", "update").mockResolvedValue({ id: "o1", key: "figado", name: {}, createdById: null })
    for (const model of ["researchProtocol", "sample", "histopathologyFinding", "grossFinding"]) {
      m(model, "count").mockResolvedValue(0)
    }
    await expect(approveCatalogRequest("q1", "u-rev")).resolves.toEqual({ createdItemId: "o1" })
    expect(m("organ", "create")).not.toHaveBeenCalled()
    expect(
      arg<{ data: Record<string, unknown> }>(m("catalogRequest", "updateMany")).data,
    ).toMatchObject({ status: "APPROVED", createdItemId: "o1" })
  })

  it("edição de item excluído no intervalo: 404 e a solicitação continua pendente", async () => {
    m("catalogRequest", "findUnique").mockResolvedValue(request({ targetId: "o-sumiu" }))
    m("organ", "findUnique").mockResolvedValue(null)
    await expect(approveCatalogRequest("q1", "u-rev")).rejects.toMatchObject({
      code: "catalogNotFound",
    })
    expect(m("catalogRequest", "updateMany")).not.toHaveBeenCalled()
  })

  // Aprovação simultânea ou item criado direto no intervalo.
  it("nome que passou a existir: auto-rejeita como duplicata apontando o item canônico e avisa o revisor", async () => {
    emptyCatalog()
    m("catalogRequest", "findUnique").mockResolvedValue(request())
    m("organ", "findUnique").mockResolvedValue(null)
    m("organ", "create").mockRejectedValue(prismaError("P2002"))
    m("organ", "findMany").mockResolvedValue([
      { id: "o-canonico", key: "figado", name: { pt: "Fígado", en: "Liver" }, createdById: null },
    ])
    await expect(approveCatalogRequest("q1", "u-rev")).rejects.toMatchObject({
      name: "ConflictError",
      code: "catalogDuplicate",
    })
    const upd = arg<{ where: unknown; data: Record<string, unknown> }>(
      m("catalogRequest", "updateMany"),
    )
    expect(upd.where).toEqual({ id: "q1", status: "PENDING" })
    expect(upd.data).toMatchObject({
      status: "REJECTED",
      reviewedById: "u-rev",
      reviewNote: "duplicate",
      duplicateOfId: "o-canonico",
    })
  })

  it("outro tipo de falha na aprovação não rejeita a solicitação", async () => {
    m("catalogRequest", "findUnique").mockResolvedValue(request({ payload: { namePt: "" } }))
    await expect(approveCatalogRequest("q1", "u-rev")).rejects.toBeInstanceOf(ZodError)
    expect(m("catalogRequest", "updateMany")).not.toHaveBeenCalled()
  })

  it.each([
    ["nota aparada", "  nome incorreto ", "nome incorreto"],
    ["nota em branco", "   ", null],
    ["sem nota", null, null],
  ])("rejeitar com %s", async (_label, note, stored) => {
    m("catalogRequest", "findUnique").mockResolvedValue(request())
    m("catalogRequest", "updateMany").mockResolvedValue({ count: 1 })
    await rejectCatalogRequest("q1", "u-rev", note)
    const upd = arg<{ where: unknown; data: Record<string, unknown> }>(
      m("catalogRequest", "updateMany"),
    )
    expect(upd.where).toEqual({ id: "q1", status: "PENDING" })
    expect(upd.data).toMatchObject({
      status: "REJECTED",
      reviewedById: "u-rev",
      reviewNote: stored,
    })
  })

  it("outro revisor processou no intervalo: a rejeição não casa e vira conflito", async () => {
    m("catalogRequest", "findUnique").mockResolvedValue(request())
    m("catalogRequest", "updateMany").mockResolvedValue({ count: 0 })
    await expect(rejectCatalogRequest("q1", "u-rev", null)).rejects.toMatchObject({
      code: "catalogRequestProcessed",
    })
  })
})
