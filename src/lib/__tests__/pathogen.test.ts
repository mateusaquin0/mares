import { describe, it, expect } from "vitest"
import { isBroadPathogen } from "@/lib/pathogen"

describe("isBroadPathogen", () => {
  it("usa o taxonRank do NCBI quando presente (determinístico)", () => {
    // Rank vence a heurística lexical: mesmo com nome de espécie, "genus" é amplo.
    expect(isBroadPathogen({ scientificName: "Sarcocystis", taxonRank: "genus" })).toBe(true)
    expect(isBroadPathogen({ scientificName: "Sarcocystidae", taxonRank: "family" })).toBe(true)
    expect(isBroadPathogen({ scientificName: "Eimeriida", taxonRank: "order" })).toBe(true)
    // Espécie e abaixo → não amplo, ainda que o nome "pareça" gênero.
    expect(isBroadPathogen({ scientificName: "Sarcocystis sp.", taxonRank: "species" })).toBe(false)
    expect(isBroadPathogen({ scientificName: "Toxoplasma gondii", taxonRank: "species" })).toBe(
      false,
    )
    expect(isBroadPathogen({ scientificName: "T. gondii RH", taxonRank: "no rank" })).toBe(false)
  })

  it("gênero (sp./spp.) é amplo", () => {
    expect(isBroadPathogen({ scientificName: "Sarcocystis sp." })).toBe(true)
    expect(isBroadPathogen({ scientificName: "Sarcocystis spp." })).toBe(true)
    expect(isBroadPathogen({ scientificName: "Besnoitia sp" })).toBe(true)
  })

  it("família/ordem em token único é amplo", () => {
    expect(isBroadPathogen({ scientificName: "Sarcocystidae" })).toBe(true)
    expect(isBroadPathogen({ scientificName: "Eucoccidiorida" })).toBe(false) // sufixo não listado
  })

  it("scientificName igual à família é amplo", () => {
    expect(isBroadPathogen({ scientificName: "Sarcocystidae", taxonFamily: "Sarcocystidae" })).toBe(
      true,
    )
  })

  it("espécie resolvida não é ampla", () => {
    expect(
      isBroadPathogen({ scientificName: "Toxoplasma gondii", taxonFamily: "Sarcocystidae" }),
    ).toBe(false)
    expect(isBroadPathogen({ scientificName: "Neospora caninum" })).toBe(false)
  })

  it("patógeno de nome comum (sem scientificName) nunca é amplo", () => {
    expect(isBroadPathogen({ scientificName: null })).toBe(false)
    expect(isBroadPathogen({ scientificName: "" })).toBe(false)
  })
})
