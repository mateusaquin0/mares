import { describe, it, expect } from "vitest"
import type { Prisma } from "@prisma/client"
import {
  parseAnimalListParams,
  buildAnimalWhere,
  animalOrderBy,
  DEFAULT_PAGE_SIZE,
} from "@/lib/animal-query"

const parse = (qs: string) => parseAnimalListParams(new URLSearchParams(qs))
// `AND` do Prisma é objeto-ou-array; buildAnimalWhere sempre usa array.
const andOf = (w: Prisma.AnimalWhereInput) => (w.AND ?? []) as Prisma.AnimalWhereInput[]

describe("parseAnimalListParams", () => {
  it("aplica padrões quando ausente", () => {
    const f = parse("")
    expect(f).toMatchObject({
      q: "",
      species: [],
      visibility: "all",
      samples: "all",
      sort: "date",
      dir: "desc",
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      idsOnly: false,
    })
  })

  it("aceita multivalor por vírgula e repetição", () => {
    expect(parse("species=a,b&species=c").species).toEqual(["a", "b", "c"])
    expect(parse("pathogen=p1").pathogen).toEqual(["p1"])
  })

  it("valida pageSize (só 10/20/30) e page mínimo 1", () => {
    expect(parse("pageSize=25").pageSize).toBe(DEFAULT_PAGE_SIZE)
    expect(parse("pageSize=30").pageSize).toBe(30)
    expect(parse("page=0").page).toBe(1)
    expect(parse("page=4").page).toBe(4)
  })

  it("valida sort/dir e enums de visibilidade/amostras", () => {
    expect(parse("sort=hacker").sort).toBe("date")
    expect(parse("sort=species&dir=asc")).toMatchObject({ sort: "species", dir: "asc" })
    expect(parse("visibility=xyz").visibility).toBe("all")
    expect(parse("visibility=public").visibility).toBe("public")
    expect(parse("samples=with").samples).toBe("with")
  })

  it("reconhece idsOnly", () => {
    expect(parse("idsOnly=1").idsOnly).toBe(true)
    expect(parse("idsOnly=0").idsOnly).toBe(false)
  })
})

describe("buildAnimalWhere", () => {
  it("sempre inclui o escopo da organização", () => {
    const where = buildAnimalWhere("org1", undefined, parse(""))
    expect(andOf(where)[0]).toEqual({ research: { orgId: "org1" } })
  })

  // A participação só conta quando ACEITA: um convite pendente não pode fazer o indivíduo
  // aparecer na listagem de quem ainda não respondeu (ver src/lib/animal-participation.ts).
  it("restringe às pesquisas do escopo (primária ou participação ACEITA)", () => {
    const where = buildAnimalWhere("org1", ["r1", "r2"], parse(""))
    expect(andOf(where)[0]).toEqual({
      research: { orgId: "org1" },
      OR: [
        { researchId: { in: ["r1", "r2"] } },
        { participations: { some: { researchId: { in: ["r1", "r2"] }, status: "ACCEPTED" } } },
      ],
    })
  })

  it("o filtro por pesquisa também ignora convites pendentes", () => {
    const and = andOf(buildAnimalWhere("org1", undefined, parse("research=r9")))
    expect(and).toContainEqual({
      OR: [
        { researchId: { in: ["r9"] } },
        { participations: { some: { researchId: { in: ["r9"] }, status: "ACCEPTED" } } },
      ],
    })
  })

  it("traduz filtros simples em cláusulas do AND", () => {
    const and = andOf(buildAnimalWhere("o", undefined, parse("species=Sotalia&sex=M&state=SC")))
    expect(and).toContainEqual({ species: { in: ["Sotalia"] } })
    expect(and).toContainEqual({ sex: { in: ["M"] } })
    expect(and).toContainEqual({ state: { in: ["SC"] } })
  })

  it("filtra patógeno positivo via amostra→análise", () => {
    const and = andOf(buildAnimalWhere("o", undefined, parse("pathogen=p1,p2")))
    expect(and).toContainEqual({
      samples: {
        some: { analyses: { some: { result: "POSITIVO", pathogenId: { in: ["p1", "p2"] } } } },
      },
    })
  })

  it("visibilidade pública efetiva = animal e pesquisa públicos", () => {
    const and = andOf(buildAnimalWhere("o", undefined, parse("visibility=public")))
    expect(and).toContainEqual({ isPublic: true, research: { isPublic: true } })
  })

  it("amostras with/without viram some/none", () => {
    expect(andOf(buildAnimalWhere("o", undefined, parse("samples=with")))).toContainEqual({
      samples: { some: {} },
    })
    expect(andOf(buildAnimalWhere("o", undefined, parse("samples=without")))).toContainEqual({
      samples: { none: {} },
    })
  })

  it("busca textual gera OR de contains insensitive", () => {
    const and = andOf(buildAnimalWhere("o", undefined, parse("q=abc")))
    const search = and.find((c) => "OR" in c) as { OR: Prisma.AnimalWhereInput[] }
    expect(search.OR).toContainEqual({ species: { contains: "abc", mode: "insensitive" } })
  })
})

describe("animalOrderBy", () => {
  it("data (padrão) ordena com nulos por último", () => {
    expect(animalOrderBy("date", "desc")).toEqual({ eventDate: { sort: "desc", nulls: "last" } })
  })
  it("amostras ordena pela contagem da relação", () => {
    expect(animalOrderBy("samples", "asc")).toEqual({ samples: { _count: "asc" } })
  })
  it("pesquisa ordena pelo nome da relação", () => {
    expect(animalOrderBy("research", "asc")).toEqual({ research: { name: "asc" } })
  })
  it("colunas simples mapeiam direto", () => {
    expect(animalOrderBy("species", "asc")).toEqual({ species: "asc" })
    expect(animalOrderBy("location", "desc")).toEqual({ municipality: "desc" })
  })
})
