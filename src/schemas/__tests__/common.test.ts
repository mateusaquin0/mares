import { describe, it, expect } from "vitest"
import { optionalDate, optionalNumber, optionalText } from "@/schemas/common"

// Semântica dos campos opcionais (docs do próprio módulo): ausente = "não mexer" (undefined),
// null ou vazio = "limpar" (null), senão o texto aparado. É ela que permite ao PUT parcial
// distinguir "não enviei" de "apaguei".

describe("optionalText", () => {
  const schema = optionalText(10)

  it("ausente continua ausente (o PUT parcial não toca no campo)", () => {
    expect(schema.parse(undefined)).toBeUndefined()
  })

  it.each([
    ["null", null],
    ["string vazia", ""],
    ["só espaços", "   "],
  ])("%s limpa o campo (null)", (_label, input) => {
    expect(schema.parse(input)).toBeNull()
  })

  it("apara os espaços em volta do texto", () => {
    expect(schema.parse("  fígado ")).toBe("fígado")
  })

  it("aceita exatamente o limite e recusa um caractere a mais", () => {
    expect(schema.safeParse("a".repeat(10)).success).toBe(true)
    expect(schema.safeParse("a".repeat(11)).success).toBe(false)
  })

  it("recusa o que não é texto", () => {
    expect(schema.safeParse(42).success).toBe(false)
  })
})

describe("optionalDate", () => {
  it("ausente continua ausente; null e vazio limpam", () => {
    expect(optionalDate.parse(undefined)).toBeUndefined()
    expect(optionalDate.parse(null)).toBeNull()
    expect(optionalDate.parse("")).toBeNull()
    expect(optionalDate.parse("   ")).toBeNull()
  })

  it.each(["2026-03-10", "2026-03-10T12:30:00.000Z", " 2026-03-10 "])(
    "aceita o dia em ISO: %s",
    (input) => {
      expect(optionalDate.parse(input)).toBe(input.trim())
    },
  )

  // "10/03/2026" passaria por Date.parse como 3 de OUTUBRO (formato americano): a data
  // brasileira seria gravada com dia e mês trocados, sem erro nenhum.
  it.each(["10/03/2026", "03-10-2026", "2026/03/10", "10 de março de 2026", "amanhã", "2026"])(
    "recusa data fora do formato AAAA-MM-DD: %s",
    (input) => {
      const r = optionalDate.safeParse(input)
      expect(r.success).toBe(false)
      expect(r.error?.issues[0]?.message).toBe("invalidDate")
    },
  )

  it.each(["2026-13-01", "2026-00-10", "2026-03-32", "2026-03-10 lixo"])(
    "recusa data no formato certo mas impossível de interpretar: %s",
    (input) => {
      expect(optionalDate.safeParse(input).success).toBe(false)
    },
  )

  // BUG (src/schemas/common.ts:20): a validação delega ao Date.parse, que no V8 aceita dia
  // até 31 em qualquer mês e ROLA a data — "2026-02-30" é aceito e gravado como 2 de março.
  it.fails.each(["2026-02-30", "2026-02-31", "2026-04-31", "2025-02-29"])(
    "recusa dia que não existe no mês: %s",
    (input) => {
      expect(optionalDate.safeParse(input).success).toBe(false)
    },
  )
})

describe("optionalNumber", () => {
  it("aceita número, null (limpa) e ausência", () => {
    expect(optionalNumber.parse(-80)).toBe(-80)
    expect(optionalNumber.parse(null)).toBeNull()
    expect(optionalNumber.parse(undefined)).toBeUndefined()
  })

  it.each([["12"], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    "recusa %s com a chave 'number'",
    (input) => {
      const r = optionalNumber.safeParse(input)
      expect(r.success).toBe(false)
      expect(r.error?.issues[0]?.message).toBe("number")
    },
  )
})
