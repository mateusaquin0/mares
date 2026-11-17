import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { LIFE_STAGE_OPTIONS, LIFE_STAGE_VALUES, SEX_OPTIONS, SEX_VALUES } from "@/lib/animal-enums"
import { pathogenName, txt } from "@/lib/catalog-i18n"
import { getCountries, getCountryName } from "@/lib/countries"
import { ERROR_CODES } from "@/lib/error-codes"
import {
  ANTHROPIC_INTERACTION_OPTIONS,
  ANTHROPIC_INTERACTION_VALUES,
  DISTRIBUTION_OPTIONS,
  DISTRIBUTION_VALUES,
  INTERACTION_DEGREES,
  NECROPSY_STATUS_OPTIONS,
  NECROPSY_STATUS_VALUES,
  SEVERITY_OPTIONS,
  SEVERITY_VALUES,
} from "@/lib/necropsy-enums"
import { TERMS_VERSION } from "@/lib/terms"
import { cn } from "@/lib/utils"

type Messages = Record<string, Record<string, string>>
const load = (locale: string) =>
  JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf-8")) as Messages

describe("txt — rótulo de catálogo no idioma ativo", () => {
  it("texto simples sai como está; nulo vira vazio", () => {
    expect(txt("pt", "Brucella ceti")).toBe("Brucella ceti")
    expect(txt("pt", null)).toBe("")
    expect(txt("en", undefined)).toBe("")
  })

  it("escolhe o idioma pedido", () => {
    expect(txt("pt", { pt: "Fígado", en: "Liver" })).toBe("Fígado")
    expect(txt("en", { pt: "Fígado", en: "Liver" })).toBe("Liver")
  })

  it("cai para o outro idioma quando a tradução falta ou está vazia", () => {
    expect(txt("en", { pt: "Fígado" })).toBe("Fígado")
    expect(txt("en", { pt: "Fígado", en: "" })).toBe("Fígado")
    expect(txt("pt", { pt: null, en: "Liver" })).toBe("Liver")
    expect(txt("pt", {})).toBe("")
  })

  it("qualquer idioma que não seja 'en' usa o português", () => {
    expect(txt("es", { pt: "Fígado", en: "Liver" })).toBe("Fígado")
  })
})

describe("pathogenName", () => {
  it("o nome científico é universal e tem prioridade sobre o nome comum", () => {
    expect(
      pathogenName("en", { scientificName: "Brucella ceti", name: { pt: "x", en: "y" } }),
    ).toBe("Brucella ceti")
  })

  it("sem nome científico, usa o nome comum traduzido", () => {
    const p = { scientificName: null, name: { pt: "Morbilivírus", en: "Morbillivirus" } }
    expect(pathogenName("pt", p)).toBe("Morbilivírus")
    expect(pathogenName("en", p)).toBe("Morbillivirus")
  })

  it("sem nenhum dos dois devolve vazio (o chamador descarta o rótulo)", () => {
    expect(pathogenName("pt", {})).toBe("")
    expect(pathogenName("pt", { scientificName: "", name: null })).toBe("")
  })
})

// As listas de opções alimentam os selects; os VALUES alimentam o z.enum. Se divergirem, o
// formulário oferece um valor que a validação recusa (ou esconde um que ela aceita).
describe("vocabulários em código: opções × valores canônicos", () => {
  it.each([
    ["sexo", SEX_OPTIONS, SEX_VALUES],
    ["estágio de vida", LIFE_STAGE_OPTIONS, LIFE_STAGE_VALUES],
    ["distribuição", DISTRIBUTION_OPTIONS, DISTRIBUTION_VALUES],
    ["severidade", SEVERITY_OPTIONS, SEVERITY_VALUES],
    ["status do sistema", NECROPSY_STATUS_OPTIONS, NECROPSY_STATUS_VALUES],
    ["interação antrópica", ANTHROPIC_INTERACTION_OPTIONS, ANTHROPIC_INTERACTION_VALUES],
  ] as const)("%s: cada valor tem exatamente uma opção", (_label, options, values) => {
    expect([...options.map((o) => o.value)].sort()).toEqual([...values].sort())
    expect(new Set(options.map((o) => o.key)).size).toBe(options.length)
  })

  it("a severidade vai do menor ao maior grau, e o máximo gravado é 'marked'", () => {
    expect(SEVERITY_VALUES[0]).toBe("mild")
    expect(SEVERITY_VALUES.at(-1)).toBe("marked")
  })

  it("o grau da interação antrópica vai de 1 a 3 (escala do PMP)", () => {
    expect([...INTERACTION_DEGREES]).toEqual([1, 2, 3])
  })

  it.each(["pt", "en"])("%s.animals traduz sexo e estágio de vida", (locale) => {
    const ns = load(locale).animals ?? {}
    const keys = [...SEX_OPTIONS, ...LIFE_STAGE_OPTIONS].map((o) => o.key)
    expect(keys.filter((k) => !ns[k])).toEqual([])
  })
})

// O servidor devolve o código; a interface traduz. Código sem tradução aparece cru na tela.
describe("i18n dos códigos de erro", () => {
  it.each(["pt", "en"])("%s.errors traduz todos os códigos", (locale) => {
    const ns = load(locale).errors ?? {}
    expect(Object.values(ERROR_CODES).filter((code) => !ns[code])).toEqual([])
  })

  it("pt e en têm exatamente as mesmas chaves de erro", () => {
    expect(Object.keys(load("pt").errors ?? {}).sort()).toEqual(
      Object.keys(load("en").errors ?? {}).sort(),
    )
  })
})

describe("países", () => {
  it("resolve o nome pelo ISO2 no idioma pedido", () => {
    expect(getCountryName("BR", "pt")).toBe("Brasil")
    expect(getCountryName("BR", "en")).toBe("Brazil")
  })

  it("idioma desconhecido cai para o inglês", () => {
    expect(getCountryName("DE", "fr")).toBe("Germany")
  })

  it("sem código devolve vazio; código desconhecido devolve o próprio código", () => {
    expect(getCountryName(null, "pt")).toBe("")
    expect(getCountryName(undefined, "pt")).toBe("")
    expect(getCountryName("ZZ", "pt")).toBe("ZZ")
  })

  it("a lista vem em ordem alfabética do idioma (acentos não vão para o fim)", () => {
    const names = getCountries("pt").map((c) => c.name)
    expect(names.length).toBeGreaterThan(190)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "pt")))
    expect(names.indexOf("Áustria")).toBeLessThan(names.indexOf("Brasil"))
    expect(getCountries("pt").find((c) => c.iso2 === "BR")?.name).toBe("Brasil")
  })
})

describe("utilitários", () => {
  it("cn combina classes condicionais e resolve conflitos do Tailwind (a última vence)", () => {
    expect(cn("px-2", false && "hidden", "px-4")).toBe("px-4")
    expect(cn("text-sm", undefined, ["font-bold"])).toBe("text-sm font-bold")
  })

  it("a versão dos termos é uma data ISO (comparável e ordenável)", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(TERMS_VERSION))).toBe(false)
  })
})
