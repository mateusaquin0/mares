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
  "generalized",
] as const

// A escala vai do menor ao maior grau, e as duas faixas intermediárias ("discreto a
// moderado", "moderado a severo") existem porque a lesão nem sempre cai num degrau só.
// `marked` é o valor GRAVADO do grau máximo — o rótulo mudou de "acentuado" para "severo",
// que é como o laudo o chama, e renomear o valor exigiria migrar os laudos já preenchidos.
export const SEVERITY_VALUES = [
  "mild",
  "mild_moderate",
  "moderate",
  "moderate_severe",
  "marked",
] as const

export const NECROPSY_STATUS_VALUES = ["NO_CHANGE", "NOT_EXAMINED", "ALTERED"] as const

// Tipos de interação antrópica da triagem da carcaça. Em MAIÚSCULAS porque espelham o enum
// `AnthropicInteractionType` do Prisma, como NECROPSY_STATUS_VALUES.
export const ANTHROPIC_INTERACTION_VALUES = ["FISHERY", "WASTE", "AGGRESSION", "VESSEL"] as const

// Grau da interação: 1 a 3, na escala do PMP. É o mesmo intervalo para todos os tipos, por
// isso vive aqui e não numa lista por tipo.
export const INTERACTION_DEGREES = [1, 2, 3] as const

export type DistributionValue = (typeof DISTRIBUTION_VALUES)[number]
export type SeverityValue = (typeof SEVERITY_VALUES)[number]
export type NecropsyStatusValue = (typeof NECROPSY_STATUS_VALUES)[number]
export type AnthropicInteractionValue = (typeof ANTHROPIC_INTERACTION_VALUES)[number]

// Valor + chave i18n para montar selects e rótulos. `as const satisfies` mantém as chaves
// como literais (para o `t` do next-intl) e garante que os `value` são valores canônicos.
export const DISTRIBUTION_OPTIONS = [
  { value: "focal", key: "distributionFocal" },
  { value: "multifocal", key: "distributionMultifocal" },
  { value: "multifocal_coalescing", key: "distributionMultifocalCoalescing" },
  { value: "locally_extensive", key: "distributionLocallyExtensive" },
  { value: "segmental", key: "distributionSegmental" },
  { value: "diffuse", key: "distributionDiffuse" },
  { value: "generalized", key: "distributionGeneralized" },
] as const satisfies readonly { value: DistributionValue; key: string }[]

export const SEVERITY_OPTIONS = [
  { value: "mild", key: "severityMild" },
  { value: "mild_moderate", key: "severityMildModerate" },
  { value: "moderate", key: "severityModerate" },
  { value: "moderate_severe", key: "severityModerateSevere" },
  { value: "marked", key: "severityMarked" },
] as const satisfies readonly { value: SeverityValue; key: string }[]

export const ANTHROPIC_INTERACTION_OPTIONS = [
  { value: "FISHERY", key: "interactionFishery" },
  { value: "WASTE", key: "interactionWaste" },
  { value: "AGGRESSION", key: "interactionAggression" },
  { value: "VESSEL", key: "interactionVessel" },
] as const satisfies readonly { value: AnthropicInteractionValue; key: string }[]

export const NECROPSY_STATUS_OPTIONS = [
  { value: "ALTERED", key: "statusAltered" },
  { value: "NO_CHANGE", key: "statusNoChange" },
  { value: "NOT_EXAMINED", key: "statusNotExamined" },
] as const satisfies readonly { value: NecropsyStatusValue; key: string }[]
