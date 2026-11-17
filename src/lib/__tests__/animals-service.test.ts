// Regras do indivíduo que não dependem do banco real: situação do identificador (livre,
// visível, fora do escopo), compartilhamento entre pesquisas (convite × pedido), ocultação e
// desvínculo. O Prisma é simulado; o comportamento transacional fica com a integração.

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", async () => (await import("./helpers/prisma-mock")).prismaModule)

import { arg, m, prismaError, resetDb, root } from "./helpers/prisma-mock"
import {
  acceptAnimalShare,
  animalData,
  animalDuplicateConflict,
  assertResearchInOrg,
  assertResearchOnAnimal,
  countPendingShares,
  createAnimalShare,
  findAnimalByIdentifier,
  listPendingShares,
  loadAnimalOrg,
  removeAnimalResearch,
  setAnimalHidden,
  toAnimalListItem,
} from "@/lib/animals"

beforeEach(() => resetDb())

const found = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  researchId: "r-primaria",
  species: "Sotalia guianensis",
  eventDate: new Date("2025-03-10T00:00:00.000Z"),
  municipality: "Florianópolis",
  state: "SC",
  research: { name: "Cetáceos SC" },
  participations: [],
  ...over,
})

describe("animalData — campos validados → dados do Prisma", () => {
  it("datas viram meia-noite UTC do dia informado", () => {
    const data = animalData({ eventDate: "2026-03-10", necropsyDate: "2026-03-12" })
    expect(data.eventDate?.toISOString()).toBe("2026-03-10T00:00:00.000Z")
    expect(data.necropsyDate?.toISOString()).toBe("2026-03-12T00:00:00.000Z")
  })

  it("ausente não altera (undefined) e null limpa — para datas e para os demais campos", () => {
    const ausente = animalData({})
    expect(ausente.eventDate).toBeUndefined()
    expect(ausente.necropsyDate).toBeUndefined()
    expect(ausente.species).toBeUndefined()

    const limpo = animalData({ eventDate: null, necropsyDate: null, species: null })
    expect(limpo.eventDate).toBeNull()
    expect(limpo.necropsyDate).toBeNull()
    expect(limpo.species).toBeNull()
  })

  // researchId e isPublic têm regra própria na rota: não podem entrar de carona.
  it("não repassa campos fora da lista editável", () => {
    const data = animalData({
      controlId: "902/99",
      researchId: "r-outra",
      isPublic: true,
      orgId: "org-alheia",
    } as never)
    expect(data.controlId).toBe("902/99")
    expect(Object.keys(data)).not.toContain("researchId")
    expect(Object.keys(data)).not.toContain("isPublic")
    expect(Object.keys(data)).not.toContain("orgId")
  })
})

describe("toAnimalListItem", () => {
  const raw = {
    id: "a1",
    controlId: "902/99",
    simbaRecordNumber: null,
    species: "Sotalia guianensis",
    sex: "F",
    lifeStage: "ADULT",
    municipality: null,
    state: null,
    eventDate: null,
    isPublic: false,
    research: { id: "r1", name: "Primária", isPublic: true },
    participations: [{ research: { id: "r2", name: "Participante" } }],
    _count: { samples: 2 },
    samples: [
      {
        analyses: [
          { pathogen: { scientificName: "Toxoplasma gondii", name: null } },
          { pathogen: { scientificName: null, name: { pt: "Morbilivírus", en: "Morbillivirus" } } },
        ],
      },
      { analyses: [{ pathogen: { scientificName: "Toxoplasma gondii", name: null } }] },
    ],
  }

  it("lista as pesquisas do indivíduo (primária primeiro) e os positivos sem repetição", () => {
    const item = toAnimalListItem("pt", raw as never)
    expect(item.researches.map((r) => r.id)).toEqual(["r1", "r2"])
    expect(item.positivePathogens).toEqual(["Morbilivírus", "Toxoplasma gondii"])
    expect(item._count.samples).toBe(2)
  })

  it("a árvore de amostras/análises não vai para o cliente", () => {
    const item = toAnimalListItem("en", raw as never) as Record<string, unknown>
    expect("samples" in item).toBe(false)
    expect("participations" in item).toBe(false)
    expect(item.positivePathogens).toEqual(["Morbillivirus", "Toxoplasma gondii"])
  })
})

describe("findAnimalByIdentifier — o identificador já existe no grupo?", () => {
  it("sem identificador não consulta", async () => {
    await expect(findAnimalByIdentifier("org-a", { all: true }, {})).resolves.toBeNull()
    expect(m("animal", "findFirst")).not.toHaveBeenCalled()
  })

  it("identificador livre devolve null", async () => {
    m("animal", "findFirst").mockResolvedValue(null)
    await expect(
      findAnimalByIdentifier("org-a", { all: true }, { controlId: "1" }),
    ).resolves.toBeNull()
  })

  it("a busca é sempre dentro da organização; o Nº SIMBA tem prioridade sobre o ID de controle", async () => {
    m("animal", "findFirst").mockResolvedValue(null)
    await findAnimalByIdentifier("org-a", { all: true }, { controlId: "902/99" })
    expect(arg(m("animal", "findFirst")).where).toEqual({ orgId: "org-a", controlId: "902/99" })
    await findAnimalByIdentifier(
      "org-a",
      { all: true },
      { controlId: "902/99", simbaRecordNumber: "225696" },
    )
    expect(arg(m("animal", "findFirst"), 1).where).toEqual({
      orgId: "org-a",
      simbaRecordNumber: "225696",
    })
  })

  it.each([
    ["admin da organização", { all: true as const }, [], true],
    ["membro da pesquisa primária", { all: false as const, ids: ["r-primaria"] }, [], true],
    [
      "membro de pesquisa com participação ACEITA",
      { all: false as const, ids: ["r2"] },
      [{ researchId: "r2", status: "ACCEPTED" }],
      true,
    ],
    // Convite pendente não concede visibilidade.
    [
      "membro de pesquisa com convite PENDENTE",
      { all: false as const, ids: ["r2"] },
      [{ researchId: "r2", status: "PENDING" }],
      false,
    ],
    ["pesquisador sem relação com o indivíduo", { all: false as const, ids: ["r9"] }, [], false],
  ])("%s → visível=%s", async (_label, scope, participations, visible) => {
    m("animal", "findFirst").mockResolvedValue(found({ participations }))
    const hit = await findAnimalByIdentifier("org-a", scope, { controlId: "902/99" })
    expect(hit?.visible).toBe(visible)
  })

  it("devolve a identidade mínima para a pessoa comparar com o que digitou", async () => {
    m("animal", "findFirst").mockResolvedValue(found())
    const hit = await findAnimalByIdentifier("org-a", { all: true }, { controlId: "902/99" })
    expect(hit).toMatchObject({
      animalId: "a1",
      research: "Cetáceos SC",
      researchId: "r-primaria",
      species: "Sotalia guianensis",
      eventDate: "2025-03-10T00:00:00.000Z",
      location: "Florianópolis, SC",
    })
  })

  it("campos vazios da identidade viram texto vazio, sem vírgula sobrando", async () => {
    m("animal", "findFirst").mockResolvedValue(
      found({ species: null, eventDate: null, municipality: null, state: "SC" }),
    )
    const hit = await findAnimalByIdentifier("org-a", { all: true }, { controlId: "902/99" })
    expect(hit).toMatchObject({ species: "", eventDate: "", location: "SC" })
  })

  // `linkOf` decide o que a tela oferece: nada (já vinculado), aguardar (pendente) ou
  // propor o compartilhamento (nenhum vínculo).
  it("linkOf: situação do indivíduo em relação à pesquisa escolhida no formulário", async () => {
    m("animal", "findFirst").mockResolvedValue(
      found({
        participations: [
          { researchId: "r-aceita", status: "ACCEPTED" },
          { researchId: "r-pendente", status: "PENDING" },
        ],
      }),
    )
    const hit = await findAnimalByIdentifier("org-a", { all: true }, { controlId: "902/99" })
    expect(hit?.linkOf("r-primaria")).toBe("linked")
    expect(hit?.linkOf("r-aceita")).toBe("linked")
    expect(hit?.linkOf("r-pendente")).toBe("pending")
    expect(hit?.linkOf("r-outra")).toBe("none")
    expect(hit?.linkOf("")).toBe("none")
  })
})

describe("animalDuplicateConflict — duplicado numa pesquisa VISÍVEL", () => {
  const p2002 = (target: string[]) => prismaError("P2002", { target })
  const ctx = {
    orgId: "org-a",
    scope: { all: false as const, ids: ["r-primaria", "r-minha"] },
    controlId: "902/99",
    simbaRecordNumber: "225696",
  }

  it("nomeia a pesquisa, manda o id para 'abrir o registro' e diz se cabe vincular", async () => {
    m("animal", "findFirst").mockResolvedValue(found())
    const err = await animalDuplicateConflict(p2002(["orgId", "controlId"]), {
      ...ctx,
      targetResearchId: "r-minha",
    })
    expect(err.code).toBe("animalControlDuplicateInResearch")
    expect(err.message).toContain("Cetáceos SC")
    // Visível mas ainda não vinculado à pesquisa de destino: a tela oferece o vínculo.
    expect(err.params).toEqual({ research: "Cetáceos SC", animalId: "a1", link: "none" })
  })

  it("duplicado de Nº SIMBA na PRÓPRIA pesquisa de destino: já vinculado", async () => {
    m("animal", "findFirst").mockResolvedValue(found())
    const err = await animalDuplicateConflict(p2002(["orgId", "simbaRecordNumber"]), {
      ...ctx,
      targetResearchId: "r-primaria",
    })
    expect(err.code).toBe("animalSimbaDuplicateInResearch")
    expect(err.params?.link).toBe("linked")
  })

  it("na edição (sem pesquisa de destino) o vínculo é 'none'", async () => {
    m("animal", "findFirst").mockResolvedValue(found())
    const err = await animalDuplicateConflict(p2002(["orgId", "controlId"]), ctx)
    expect(err.params?.link).toBe("none")
  })

  it.each([
    ["o valor em conflito não foi enviado (PUT parcial)", { ...ctx, controlId: undefined }],
    ["o valor em conflito é null", { ...ctx, controlId: null }],
  ])("cai no erro genérico quando %s", async (_label, context) => {
    const err = await animalDuplicateConflict(p2002(["orgId", "controlId"]), context)
    expect(err.code).toBe("animalControlDuplicate")
    expect(err.params).toBeUndefined()
    expect(m("animal", "findFirst")).not.toHaveBeenCalled()
  })

  it("cai no erro genérico quando o registro em conflito não é localizável", async () => {
    m("animal", "findFirst").mockResolvedValue(null)
    const err = await animalDuplicateConflict(p2002(["orgId", "simbaRecordNumber"]), ctx)
    expect(err.code).toBe("animalSimbaDuplicate")
  })

  it("unicidade de campo desconhecido não tenta localizar nada", async () => {
    const err = await animalDuplicateConflict(p2002(["outra_coluna"]), ctx)
    expect(err.code).toBe("animalDuplicate")
    const semMeta = await animalDuplicateConflict(prismaError("P2002"), ctx)
    expect(semMeta.code).toBe("animalDuplicate")
  })

  it("aceita o alvo do índice como texto (nome da constraint)", async () => {
    m("animal", "findFirst").mockResolvedValue(found())
    const err = await animalDuplicateConflict(
      prismaError("P2002", { target: "Animal_orgId_simbaRecordNumber_key" }),
      ctx,
    )
    expect(err.code).toBe("animalSimbaDuplicateInResearch")
  })
})

describe("carregamento com checagem de organização", () => {
  it("animal inexistente vira 404; existente traz a organização da pesquisa", async () => {
    m("animal", "findUnique").mockResolvedValue(null)
    await expect(loadAnimalOrg("a-x")).rejects.toMatchObject({ code: "animalNotFound" })

    m("animal", "findUnique").mockResolvedValue({
      id: "a1",
      isPublic: true,
      researchId: "r1",
      research: { orgId: "org-a" },
    })
    await expect(loadAnimalOrg("a1")).resolves.toEqual({
      id: "a1",
      isPublic: true,
      researchId: "r1",
      orgId: "org-a",
    })
  })

  // Pesquisa de OUTRA organização responde igual a inexistente: não confirma que o id existe.
  it("pesquisa inexistente ou de outra organização vira o mesmo 404", async () => {
    m("research", "findUnique").mockResolvedValue(null)
    await expect(assertResearchInOrg("r-x", "org-a")).rejects.toMatchObject({
      name: "NotFoundError",
      code: "researchNotFound",
    })
    m("research", "findUnique").mockResolvedValue({ orgId: "org-b" })
    await expect(assertResearchInOrg("r1", "org-a")).rejects.toMatchObject({
      code: "researchNotFound",
    })
    m("research", "findUnique").mockResolvedValue({ orgId: "org-a" })
    await expect(assertResearchInOrg("r1", "org-a")).resolves.toBeUndefined()
  })
})

describe("createAnimalShare — convite × pedido", () => {
  const opts = { origin: "INVITE" as const, invitedById: "u1", autoAccept: false }
  const primary = () => {
    m("animal", "findUnique").mockResolvedValue({ researchId: "r-primaria" })
    m("research", "findUnique").mockResolvedValue({ orgId: "org-a" })
  }

  it("animal inexistente vira 404", async () => {
    m("animal", "findUnique").mockResolvedValue(null)
    await expect(createAnimalShare("a-x", "org-a", "r2", opts)).rejects.toMatchObject({
      code: "animalNotFound",
    })
  })

  it("não se compartilha o indivíduo com a própria pesquisa primária", async () => {
    primary()
    await expect(createAnimalShare("a1", "org-a", "r-primaria", opts)).rejects.toMatchObject({
      name: "ConflictError",
      code: "animalResearchPrimary",
    })
    expect(m("animalResearch", "create")).not.toHaveBeenCalled()
  })

  it("a pesquisa de destino precisa ser da MESMA organização", async () => {
    m("animal", "findUnique").mockResolvedValue({ researchId: "r-primaria" })
    m("research", "findUnique").mockResolvedValue({ orgId: "org-b" })
    await expect(createAnimalShare("a1", "org-a", "r-alheia", opts)).rejects.toMatchObject({
      code: "researchNotFound",
    })
    expect(m("animalResearch", "create")).not.toHaveBeenCalled()
  })

  it("nasce PENDENTE, sem data de resposta, guardando origem, autor e mensagem", async () => {
    primary()
    await expect(
      createAnimalShare("a1", "org-a", "r2", {
        ...opts,
        origin: "REQUEST",
        message: "mesmo bicho",
      }),
    ).resolves.toBe("PENDING")
    expect(arg(m("animalResearch", "create")).data).toEqual({
      animalId: "a1",
      researchId: "r2",
      origin: "REQUEST",
      status: "PENDING",
      invitedById: "u1",
      message: "mesmo bicho",
      respondedAt: null,
    })
  })

  // Quem enxerga os dois lados (membro das duas pesquisas, ou admin) não pede a própria
  // autorização.
  it("com autoAccept já nasce ACEITO e com a data da resposta", async () => {
    primary()
    await expect(
      createAnimalShare("a1", "org-a", "r2", { ...opts, autoAccept: true }),
    ).resolves.toBe("ACCEPTED")
    const data = arg<{ data: Record<string, unknown> }>(m("animalResearch", "create")).data
    expect(data.status).toBe("ACCEPTED")
    expect(data.respondedAt).toBeInstanceOf(Date)
    expect(data.message).toBeNull()
  })

  it.each([
    ["PENDING", "animalSharePending"],
    ["ACCEPTED", "animalResearchExists"],
  ])("vínculo repetido com status %s vira o conflito %s", async (status, code) => {
    primary()
    m("animalResearch", "create").mockRejectedValue(prismaError("P2002"))
    m("animalResearch", "findUnique").mockResolvedValue({ status })
    await expect(createAnimalShare("a1", "org-a", "r2", opts)).rejects.toMatchObject({
      name: "ConflictError",
      code,
    })
  })

  it("outro erro do banco é propagado sem virar conflito", async () => {
    primary()
    m("animalResearch", "create").mockRejectedValue(prismaError("P2003"))
    await expect(createAnimalShare("a1", "org-a", "r2", opts)).rejects.toMatchObject({
      code: "P2003",
    })
  })
})

describe("acceptAnimalShare", () => {
  it("compartilhamento inexistente vira 404", async () => {
    m("animalResearch", "findUnique").mockResolvedValue(null)
    await expect(acceptAnimalShare("a1", "r2")).rejects.toMatchObject({
      code: "animalShareNotFound",
    })
  })

  // Dois membros clicando juntos: o segundo aceite não é erro nem reescreve a data.
  it("aceitar de novo é idempotente e não regrava", async () => {
    m("animalResearch", "findUnique").mockResolvedValue({ status: "ACCEPTED" })
    await expect(acceptAnimalShare("a1", "r2")).resolves.toBeUndefined()
    expect(m("animalResearch", "update")).not.toHaveBeenCalled()
  })

  it("pendente passa a ACEITO com a data da resposta", async () => {
    m("animalResearch", "findUnique").mockResolvedValue({ status: "PENDING" })
    await acceptAnimalShare("a1", "r2")
    const call = arg<{ where: unknown; data: Record<string, unknown> }>(
      m("animalResearch", "update"),
    )
    expect(call.where).toEqual({ animalId_researchId: { animalId: "a1", researchId: "r2" } })
    expect(call.data.status).toBe("ACCEPTED")
    expect(call.data.respondedAt).toBeInstanceOf(Date)
  })
})

describe("caixa de entrada de compartilhamentos", () => {
  it("pesquisador sem nenhuma pesquisa não tem pendências (e não consulta)", async () => {
    await expect(listPendingShares("org-a", [])).resolves.toEqual([])
    await expect(countPendingShares("org-a", [])).resolves.toBe(0)
    expect(m("animalResearch", "findMany")).not.toHaveBeenCalled()
    expect(m("animalResearch", "count")).not.toHaveBeenCalled()
  })

  it("admin da organização responde por todas as pesquisas do grupo", async () => {
    m("animalResearch", "count").mockResolvedValue(2)
    await expect(countPendingShares("org-a")).resolves.toBe(2)
    expect(arg(m("animalResearch", "count")).where).toEqual({
      status: "PENDING",
      animal: { orgId: "org-a" },
    })
  })

  // Responde sempre o lado que ainda NÃO consentiu: o convidado no convite, o dono no pedido.
  it("pesquisador vê convites para as suas pesquisas e pedidos sobre os seus indivíduos", async () => {
    m("animalResearch", "count").mockResolvedValue(0)
    await countPendingShares("org-a", ["r1"])
    expect(arg(m("animalResearch", "count")).where).toEqual({
      status: "PENDING",
      animal: { orgId: "org-a" },
      OR: [
        { origin: "INVITE", researchId: { in: ["r1"] } },
        { origin: "REQUEST", animal: { orgId: "org-a", researchId: { in: ["r1"] } } },
      ],
    })
  })

  it("a linha separa a pesquisa que ganha o indivíduo da pesquisa de origem e serializa as datas", async () => {
    m("animalResearch", "findMany").mockResolvedValue([
      {
        origin: "INVITE",
        message: null,
        createdAt: new Date("2026-03-10T12:00:00.000Z"),
        research: { id: "r2", name: "Destino" },
        invitedBy: { name: "Ana", email: "ana@test.local" },
        animal: {
          id: "a1",
          species: "Sotalia guianensis",
          controlId: "902/99",
          simbaRecordNumber: null,
          municipality: "Itajaí",
          state: "SC",
          eventDate: new Date("2026-03-01T00:00:00.000Z"),
          research: { id: "r1", name: "Origem" },
        },
      },
      {
        origin: "REQUEST",
        message: "pedido",
        createdAt: new Date("2026-03-09T12:00:00.000Z"),
        research: { id: "r3", name: "Outra" },
        invitedBy: null,
        animal: { id: "a2", eventDate: null, research: { id: "r1", name: "Origem" } },
      },
    ])
    const [first, second] = await listPendingShares("org-a", ["r2"])
    expect(first).toMatchObject({
      origin: "INVITE",
      createdAt: "2026-03-10T12:00:00.000Z",
      research: { id: "r2", name: "Destino" },
      fromResearch: { id: "r1", name: "Origem" },
    })
    expect(first?.animal.eventDate).toBe("2026-03-01T00:00:00.000Z")
    expect("research" in (first?.animal ?? {})).toBe(false)
    expect(second?.animal.eventDate).toBeNull()
  })
})

describe("assertResearchOnAnimal — pesquisa dona de uma amostra", () => {
  it("aceita a pesquisa primária e a participante ACEITA", async () => {
    m("animal", "findUnique").mockResolvedValue({ researchId: "r1", participations: [] })
    await expect(assertResearchOnAnimal("a1", "r1")).resolves.toBeUndefined()

    m("animal", "findUnique").mockResolvedValue({
      researchId: "r1",
      participations: [{ researchId: "r2" }],
    })
    await expect(assertResearchOnAnimal("a1", "r2")).resolves.toBeUndefined()
    // O filtro de "aceita" vai na consulta: convite pendente não autoriza amostra.
    expect(
      arg<{ select: { participations: { where: unknown } } }>(m("animal", "findUnique"), 1).select
        .participations.where,
    ).toEqual({ researchId: "r2", status: "ACCEPTED" })
  })

  it("pesquisa sem vínculo com o indivíduo é recusada; animal inexistente é 404", async () => {
    m("animal", "findUnique").mockResolvedValue({ researchId: "r1", participations: [] })
    await expect(assertResearchOnAnimal("a1", "r9")).rejects.toMatchObject({
      name: "ValidationError",
      code: "animalResearchNotLinked",
    })
    m("animal", "findUnique").mockResolvedValue(null)
    await expect(assertResearchOnAnimal("a-x", "r1")).rejects.toMatchObject({
      code: "animalNotFound",
    })
  })
})

describe("removeAnimalResearch — desvincular uma pesquisa", () => {
  const counts = (samples: number, media: number) => {
    m("sample", "count").mockResolvedValue(samples)
    m("animalMedia", "count").mockResolvedValue(media)
  }

  // Amostras e arquivos ficariam pendurados numa pesquisa que não estuda mais o indivíduo.
  it.each([
    ["amostras", 1, 0],
    ["arquivos", 0, 2],
  ])("pesquisa com %s no indivíduo não pode ser desvinculada", async (_label, samples, media) => {
    counts(samples, media)
    await expect(removeAnimalResearch("a1", "r2")).rejects.toMatchObject({
      name: "ConflictError",
      code: "animalResearchHasData",
    })
    expect(m("animalResearch", "delete")).not.toHaveBeenCalled()
  })

  it("sem dados, remove o vínculo; a contagem é DESTA pesquisa NESTE indivíduo", async () => {
    counts(0, 0)
    await removeAnimalResearch("a1", "r2")
    expect(arg(m("sample", "count")).where).toEqual({ animalId: "a1", researchId: "r2" })
    expect(arg(m("animalMedia", "count")).where).toEqual({ animalId: "a1", researchId: "r2" })
    expect(arg(m("animalResearch", "delete")).where).toEqual({
      animalId_researchId: { animalId: "a1", researchId: "r2" },
    })
  })

  it("vínculo que já não existe conta como sucesso (idempotente); outros erros sobem", async () => {
    counts(0, 0)
    m("animalResearch", "delete").mockRejectedValue(prismaError("P2025"))
    await expect(removeAnimalResearch("a1", "r2")).resolves.toBeUndefined()

    m("animalResearch", "delete").mockRejectedValue(new Error("conexão caiu"))
    await expect(removeAnimalResearch("a1", "r2")).rejects.toThrow("conexão caiu")
  })
})

describe("setAnimalHidden — ocultar o indivíduo numa pesquisa", () => {
  type P = { researchId: string; hiddenAt: Date | null }
  const animal = (primaryHiddenAt: Date | null, participations: P[]) =>
    m("animal", "findUnique").mockResolvedValue({
      researchId: "r-primaria",
      primaryHiddenAt,
      participations,
    })
  const HIDDEN = new Date("2026-01-01T00:00:00.000Z")

  it("animal inexistente e pesquisa sem vínculo viram 404", async () => {
    m("animal", "findUnique").mockResolvedValue(null)
    await expect(setAnimalHidden("a-x", "r1", true)).rejects.toMatchObject({
      code: "animalNotFound",
    })
    animal(null, [])
    await expect(setAnimalHidden("a1", "r-estranha", true)).rejects.toMatchObject({
      name: "NotFoundError",
      code: "animalResearchNotLinked",
    })
  })

  it("trava a linha do indivíduo antes de ler (ocultações concorrentes)", async () => {
    animal(null, [{ researchId: "r2", hiddenAt: null }])
    await setAnimalHidden("a1", "r2", true)
    expect(root("$transaction")).toHaveBeenCalledTimes(1)
    const lock = root("$queryRaw").mock.invocationCallOrder[0]!
    const read = m("animal", "findUnique").mock.invocationCallOrder[0]!
    expect(lock).toBeLessThan(read)
    expect((root("$queryRaw").mock.calls[0]![0] as string[]).join("?")).toContain("FOR UPDATE")
  })

  // Ocultar é a saída do indivíduo compartilhado (que não pode ser excluído), mas ele tem de
  // continuar listado em ALGUMA pesquisa — senão some de todas as telas.
  it.each([
    ["a primária, sem nenhuma participante", "r-primaria", null, []],
    [
      "a primária, com a única participante já oculta",
      "r-primaria",
      null,
      [{ researchId: "r2", hiddenAt: HIDDEN }],
    ],
    [
      "a participante, com a primária já oculta",
      "r2",
      HIDDEN,
      [{ researchId: "r2", hiddenAt: null }],
    ],
  ] as [string, string, Date | null, P[]][])(
    "recusa ocultar %s (última pesquisa que o lista)",
    async (_label, researchId, primaryHiddenAt, participations) => {
      animal(primaryHiddenAt, participations)
      await expect(setAnimalHidden("a1", researchId, true)).rejects.toMatchObject({
        name: "ConflictError",
        code: "animalHideLastResearch",
      })
      expect(m("animal", "update")).not.toHaveBeenCalled()
      expect(m("animalResearch", "update")).not.toHaveBeenCalled()
    },
  )

  it("ocultar na primária marca o Animal quando outra pesquisa ainda o lista", async () => {
    animal(null, [{ researchId: "r2", hiddenAt: null }])
    await setAnimalHidden("a1", "r-primaria", true)
    const call = arg<{ where: unknown; data: { primaryHiddenAt: unknown } }>(m("animal", "update"))
    expect(call.where).toEqual({ id: "a1" })
    expect(call.data.primaryHiddenAt).toBeInstanceOf(Date)
    expect(m("animalResearch", "update")).not.toHaveBeenCalled()
  })

  it("ocultar na participante marca a participação, não o Animal", async () => {
    animal(null, [{ researchId: "r2", hiddenAt: null }])
    await setAnimalHidden("a1", "r2", true)
    const call = arg<{ where: unknown; data: { hiddenAt: unknown } }>(m("animalResearch", "update"))
    expect(call.where).toEqual({ animalId_researchId: { animalId: "a1", researchId: "r2" } })
    expect(call.data.hiddenAt).toBeInstanceOf(Date)
    expect(m("animal", "update")).not.toHaveBeenCalled()
  })

  it("participante pode ocultar quando OUTRA participante ainda lista, mesmo com a primária oculta", async () => {
    animal(HIDDEN, [
      { researchId: "r2", hiddenAt: null },
      { researchId: "r3", hiddenAt: null },
    ])
    await expect(setAnimalHidden("a1", "r2", true)).resolves.toBeUndefined()
  })

  it("reexibir é sempre permitido e apaga a marca", async () => {
    animal(HIDDEN, [])
    await setAnimalHidden("a1", "r-primaria", false)
    expect(arg(m("animal", "update"))).toEqual({
      where: { id: "a1" },
      data: { primaryHiddenAt: null },
    })
  })
})
