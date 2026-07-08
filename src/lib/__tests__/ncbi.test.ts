import { describe, it, expect } from "vitest"
import { parseNcbiTaxa, topLevelTaxa, lineageName } from "@/lib/ncbi"

const xml = `<TaxaSet>
  <Taxon>
    <TaxId>9739</TaxId>
    <ScientificName>Tursiops truncatus</ScientificName>
    <Rank>species</Rank>
    <LineageEx>
      <Taxon><ScientificName>Delphinidae</ScientificName><Rank>family</Rank></Taxon>
      <Taxon><ScientificName>Artiodactyla</ScientificName><Rank>order</Rank></Taxon>
    </LineageEx>
  </Taxon>
  <Taxon>
    <TaxId>42100</TaxId>
    <ScientificName>Sotalia guianensis</ScientificName>
    <Rank>species</Rank>
    <LineageEx>
      <Taxon><ScientificName>Delphinidae</ScientificName><Rank>family</Rank></Taxon>
    </LineageEx>
  </Taxon>
</TaxaSet>`

describe("topLevelTaxa", () => {
  it("isola apenas os Taxon de nível superior (ignora os do LineageEx)", () => {
    expect(topLevelTaxa(xml)).toHaveLength(2)
  })
})

describe("lineageName", () => {
  it("extrai o nome científico de um rank da linhagem", () => {
    const [first] = topLevelTaxa(xml)
    expect(lineageName(first, "family")).toBe("Delphinidae")
    expect(lineageName(first, "order")).toBe("Artiodactyla")
  })
})

describe("parseNcbiTaxa", () => {
  it("mapeia cada taxon com key, nome, rank, família e ordem", () => {
    const taxa = parseNcbiTaxa(xml)
    expect(taxa).toHaveLength(2)
    expect(taxa[0]).toMatchObject({
      key: 9739,
      scientificName: "Tursiops truncatus",
      rank: "species",
      family: "Delphinidae",
      order: "Artiodactyla",
    })
    expect(taxa[1].order).toBeNull() // sem ordem na linhagem do segundo
  })

  it("descarta taxa sem TaxId numérico ou sem nome", () => {
    const bad = `<TaxaSet><Taxon><ScientificName>Sem id</ScientificName></Taxon></TaxaSet>`
    expect(parseNcbiTaxa(bad)).toHaveLength(0)
  })

  it("retorna vazio para XML sem taxa", () => {
    expect(parseNcbiTaxa("<TaxaSet></TaxaSet>")).toHaveLength(0)
  })
})
