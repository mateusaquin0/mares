// MARES — Vocabulários do laudo anatomopatológico (distribuição e severidade) com suas
// chaves i18n (namespace "necropsy"). Mesmo desenho de animal-enums.ts: evita duplicar as
// listas em formulário, tabela, exportação e validação.
//
// Estes DOIS são termos universais de patologia — "focal", "multifocal", "discreto" valem
// para qualquer espécie —, por isso ficam em código e não em catálogo.
//
// Os SISTEMAS anatômicos já estiveram aqui e saíram: viraram catálogo (`NecropsySystem`),
// porque o MARES cobre mamíferos, répteis, aves e peixes, e cada grupo reporta estruturas
// que nenhuma lista fixa comporta. Ver docs/PLANO_EXAME_ANATOMOPATOLOGICO.md.

// Valores canônicos (usados no z.enum de validação e como tipos em todo o app).
export const DISTRIBUTION_VALUES = [
  "focal",
  "multifocal",
  "multifocal_coalescing",
  "locally_extensive",
  "segmental",
  "diffuse",
] as const

export const SEVERITY_VALUES = ["mild", "moderate", "marked"] as const

export const NECROPSY_STATUS_VALUES = ["NO_CHANGE", "NOT_EXAMINED", "ALTERED"] as const

export type DistributionValue = (typeof DISTRIBUTION_VALUES)[number]
export type SeverityValue = (typeof SEVERITY_VALUES)[number]
export type NecropsyStatusValue = (typeof NECROPSY_STATUS_VALUES)[number]

// Valor + chave i18n para montar selects e rótulos. `as const satisfies` mantém as chaves
// como literais (para o `t` do next-intl) e garante que os `value` são valores canônicos.
export const DISTRIBUTION_OPTIONS = [
  { value: "focal", key: "distributionFocal" },
  { value: "multifocal", key: "distributionMultifocal" },
  { value: "multifocal_coalescing", key: "distributionMultifocalCoalescing" },
  { value: "locally_extensive", key: "distributionLocallyExtensive" },
  { value: "segmental", key: "distributionSegmental" },
  { value: "diffuse", key: "distributionDiffuse" },
] as const satisfies readonly { value: DistributionValue; key: string }[]

export const SEVERITY_OPTIONS = [
  { value: "mild", key: "severityMild" },
  { value: "moderate", key: "severityModerate" },
  { value: "marked", key: "severityMarked" },
] as const satisfies readonly { value: SeverityValue; key: string }[]

export const NECROPSY_STATUS_OPTIONS = [
  { value: "ALTERED", key: "statusAltered" },
  { value: "NO_CHANGE", key: "statusNoChange" },
  { value: "NOT_EXAMINED", key: "statusNotExamined" },
] as const satisfies readonly { value: NecropsyStatusValue; key: string }[]
