import { describe, it, expect } from "vitest"

import {
  analysisChanges,
  applyAnalysisPatch,
  EMPTY_ANALYSIS,
  isAnalysisEmpty,
  type AnalysisValues,
} from "@/lib/analyses"

// Patch de célula da grade de análises. O ponto do arquivo é a regra que corrigiu a perda de
// alterações: chave AUSENTE não altera o campo, `null` limpa. Antes o cliente mandava os três
// campos a cada edição, e um estado de tela desatualizado revertia os que ninguém tocou.

const cell = (over: Partial<AnalysisValues> = {}): AnalysisValues => ({
  ...EMPTY_ANALYSIS,
  ...over,
})

describe("applyAnalysisPatch", () => {
  it("campo ausente do patch não é alterado", () => {
    const current = cell({ result: "POSITIVO", measureValue: 900, notes: "Fraco" })
    expect(applyAnalysisPatch(current, { result: "NEGATIVO" })).toEqual({
      result: "NEGATIVO",
      measureValue: 900,
      notes: "Fraco",
    })
  })

  it("null limpa só o campo pedido", () => {
    const current = cell({ result: "POSITIVO", measureValue: 900, notes: "Fraco" })
    expect(applyAnalysisPatch(current, { measureValue: null })).toEqual({
      result: "POSITIVO",
      measureValue: null,
      notes: "Fraco",
    })
  })

  it("patch vazio não muda nada", () => {
    const current = cell({ result: "INCONCLUSIVO", measureValue: 450, notes: null })
    expect(applyAnalysisPatch(current, {})).toEqual(current)
  })

  it("célula ainda sem lançamento parte do estado vazio", () => {
    expect(applyAnalysisPatch(null, { result: "NEGATIVO" })).toEqual({
      result: "NEGATIVO",
      measureValue: null,
      notes: null,
    })
  })

  // A regressão de produção: mudar o resultado não pode levar a medida embora.
  it("mudar o resultado preserva a medida já gravada", () => {
    const current = cell({ result: "POSITIVO", measureValue: 900 })
    const next = applyAnalysisPatch(current, { result: "NEGATIVO" })
    expect(next.measureValue).toBe(900)
  })

  it("measureValue 0 é valor, não ausência", () => {
    const next = applyAnalysisPatch(cell({ measureValue: 900 }), { measureValue: 0 })
    expect(next.measureValue).toBe(0)
    expect(isAnalysisEmpty(next)).toBe(false)
  })
})

describe("isAnalysisEmpty", () => {
  it("só é vazia com os três campos nulos", () => {
    expect(isAnalysisEmpty(EMPTY_ANALYSIS)).toBe(true)
    expect(isAnalysisEmpty(cell({ result: "NEGATIVO" }))).toBe(false)
    expect(isAnalysisEmpty(cell({ measureValue: 0 }))).toBe(false)
    expect(isAnalysisEmpty(cell({ notes: "x" }))).toBe(false)
  })
})

describe("analysisChanges", () => {
  it("lista só os campos que mudaram", () => {
    const current = cell({ result: "POSITIVO", measureValue: 900 })
    const next = applyAnalysisPatch(current, { result: "NEGATIVO" })
    expect(analysisChanges(current, next)).toEqual([
      { field: "result", oldValue: "POSITIVO", newValue: "NEGATIVO" },
    ])
  })

  it("devolve vazio quando o patch repete o valor gravado (nada a salvar)", () => {
    const current = cell({ result: "NEGATIVO", measureValue: 900 })
    expect(analysisChanges(current, applyAnalysisPatch(current, { result: "NEGATIVO" }))).toEqual(
      [],
    )
  })

  it("célula nova audita os campos preenchidos, partindo de null", () => {
    const next = applyAnalysisPatch(null, { result: "POSITIVO", measureValue: 450 })
    expect(analysisChanges(null, next)).toEqual([
      { field: "result", oldValue: null, newValue: "POSITIVO" },
      { field: "measureValue", oldValue: null, newValue: "450" },
    ])
  })

  it("limpar um campo é registrado com newValue null", () => {
    const current = cell({ result: "NEGATIVO", measureValue: 450 })
    const next = applyAnalysisPatch(current, { measureValue: null })
    expect(analysisChanges(current, next)).toEqual([
      { field: "measureValue", oldValue: "450", newValue: null },
    ])
  })

  it("converte número para texto (colunas de AuditLog são texto)", () => {
    const next = applyAnalysisPatch(null, { measureValue: 28.5 })
    expect(analysisChanges(null, next)).toEqual([
      { field: "measureValue", oldValue: null, newValue: "28.5" },
    ])
  })
})
