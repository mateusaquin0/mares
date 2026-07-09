import { describe, it, expect } from "vitest"
import { createAnimalSchema, updateAnimalSchema } from "@/schemas/animal.schema"

// Conjunto mínimo de campos obrigatórios de um animal (todos exigidos pelo schema).
const validAnimal = {
  species: "Sotalia guianensis",
  controlId: "CTRL-001",
  sex: "M",
  lifeStage: "ADULT",
  strandingLat: -26.9,
  strandingLon: -48.6,
  municipality: "Itajaí",
  state: "SC",
  eventDate: "2026-03-15",
  researchId: "res-1",
}

describe("createAnimalSchema", () => {
  it("aceita um animal com todos os obrigatórios", () => {
    expect(createAnimalSchema.safeParse(validAnimal).success).toBe(true)
  })

  it("exige researchId", () => {
    const { researchId, ...noResearch } = validAnimal
    void researchId
    expect(createAnimalSchema.safeParse(noResearch).success).toBe(false)
  })

  it("exige controlId", () => {
    const bad = { ...validAnimal, controlId: "" }
    expect(createAnimalSchema.safeParse(bad).success).toBe(false)
  })

  it("aceita espécie vazia/nula (marcável como 'indeterminado')", () => {
    // Obrigatoriedade da espécie é client-side; o schema a aceita nula (espécie indeterminada).
    expect(createAnimalSchema.safeParse({ ...validAnimal, species: "" }).success).toBe(true)
    expect(createAnimalSchema.safeParse({ ...validAnimal, species: null }).success).toBe(true)
  })

  it("aceita campos de encalhe vazios/nulos (marcáveis como 'sem informação')", () => {
    // A obrigatoriedade padrão desses campos é aplicada no cliente; o schema os aceita nulos.
    const parsed = createAnimalSchema.safeParse({
      ...validAnimal,
      municipality: "",
      state: "",
      eventDate: "",
      strandingLat: null,
      strandingLon: null,
    })
    expect(parsed.success).toBe(true)
  })

  it("rejeita latitude fora do range [-90, 90]", () => {
    expect(createAnimalSchema.safeParse({ ...validAnimal, strandingLat: 200 }).success).toBe(false)
    expect(createAnimalSchema.safeParse({ ...validAnimal, strandingLat: -91 }).success).toBe(false)
  })

  it("rejeita longitude fora do range [-180, 180]", () => {
    expect(createAnimalSchema.safeParse({ ...validAnimal, strandingLon: 200 }).success).toBe(false)
  })

  it("rejeita sexo fora do domínio (bloqueia texto livre)", () => {
    expect(createAnimalSchema.safeParse({ ...validAnimal, sex: "X" }).success).toBe(false)
  })

  it("rejeita estágio de vida fora do domínio", () => {
    expect(createAnimalSchema.safeParse({ ...validAnimal, lifeStage: "VELHO" }).success).toBe(false)
  })

  it("rejeita eventDate não parseável", () => {
    expect(createAnimalSchema.safeParse({ ...validAnimal, eventDate: "ontem" }).success).toBe(false)
  })

  it("aceita campos opcionais ausentes e limpa string vazia para null", () => {
    const parsed = createAnimalSchema.parse({ ...validAnimal, strandingBeach: "" })
    expect(parsed.strandingBeach).toBeNull()
  })
})

describe("updateAnimalSchema", () => {
  it("é parcial: aceita objeto vazio", () => {
    expect(updateAnimalSchema.safeParse({}).success).toBe(true)
  })

  it("ainda valida o range de latitude quando presente", () => {
    expect(updateAnimalSchema.safeParse({ strandingLat: 999 }).success).toBe(false)
  })
})
